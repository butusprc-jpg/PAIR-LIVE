import test from 'node:test';
import assert from 'node:assert/strict';
import {csvCell,csvRow,historyFilter,historyCsv} from '../lib/topup/export';
import {cleanupTopupTemporary} from '../lib/topup/retention';
import type {Pool} from 'pg';

test('Thai calendar filters use midnight Bangkok and validate status',()=>{
 const now=new Date('2026-11-04T18:00:00Z');
 assert.deepEqual(historyFilter(new URLSearchParams('period=today&status=APPROVED'),now),{from:'2026-11-04T17:00:00.000Z',to:'2026-11-05T17:00:00.000Z',status:'APPROVED'});
 assert.equal(historyFilter(new URLSearchParams('period=yesterday'),now).from,'2026-11-03T17:00:00.000Z');
 assert.throws(()=>historyFilter(new URLSearchParams('period=range&from=2026-11-05&to=2026-11-04')));
 assert.throws(()=>historyFilter(new URLSearchParams('status=INVALID')));
});
test('CSV protects spreadsheet formulas, preserves Thai UTF-8 and streams BOM',async()=>{
 for(const value of ['=2+3',' +2','-1','@SUM(1)'])assert.match(csvCell(value),/^"'/);
 assert.equal(csvCell('ทดสอบ,"ดี"'),'"ทดสอบ,""ดี"""');
 const row={id:'00000000-0000-4000-8000-000000000001',member_id:'00000000-0000-4000-8000-000000000002',display_name:'=HYPERLINK("evil")',requested_points:500,status:'APPROVED',created_at:new Date('2026-11-04T00:00:00Z'),approved_at:new Date('2026-11-04T00:01:00Z'),approved_by:'แอดมิน',admin_note:'สลิปตรวจแล้ว'};
 assert.match(csvRow(row),/^"2026-11-04","07:00:00"/);
 let page=0;
 const db={connect:async()=>({query:async(sql:string)=>{
  if(sql.includes('SELECT r.id'))return {rows:page++===0?[row]:[]};return {rows:[]};
 },release:()=>{}})} as unknown as Pool;
 const bytes=new Uint8Array(await new Response(historyCsv(db,{})).arrayBuffer());const output=new TextDecoder().decode(bytes);
 assert.deepEqual([...bytes.slice(0,3)],[239,187,191]);assert.match(output,/Date,Time,/);assert.match(output,/"'=HYPERLINK/);assert.match(output,/แอดมิน/);
});
test('cleanup claims due slips, retries failed R2 deletion, and never targets QR objects',async()=>{
 const id='00000000-0000-4000-8000-000000000001', key='topup-slips/'+id+'/'+id;
 let attempts=0;const sqls:string[]=[];
 const db={connect:async()=>({query:async(sql:string)=>{sqls.push(sql);if(sql.includes('RETURNING s.request_id'))return {rows:[{request_id:id,object_key:key,attempts:++attempts}]};if(sql.includes('SELECT legal_hold,state'))return {rows:[{legal_hold:false,state:'PROCESSING'}]};return {rowCount:0,rows:[]}},release:()=>{}})} as unknown as Pool;
 const fail=await cleanupTopupTemporary(db,async()=>{throw Error('offline')});assert.equal(fail.retried,1);assert.ok(sqls.some(s=>s.includes("state='RETRY'")));
 const keys:string[]=[];const ok=await cleanupTopupTemporary(db,async k=>{keys.push(k)});assert.equal(ok.purged,1);assert.deepEqual(keys,[key]);assert.ok(!keys.some(k=>k.includes('qr')));
 assert.ok(sqls.some(s=>s.includes('expires_at<=$1')&&s.includes('legal_hold=false')));
 assert.ok(sqls.every(s=>!s.includes('DELETE FROM member_topup_requests')&&!s.includes('DELETE FROM member_topup_audit')));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {assertTestTarget} from '../lib/migration-manifest';
import {changeOa,listOas} from '../lib/owner/store';
import {OwnerError} from '../lib/owner/errors';
import {requireConnectedOaActive} from '../lib/owner/service-gate';
const raw=process.env.OWNER_OA_TEST_DATABASE_URL;
test('owner OA records isolate A and B, reject duplicates and replay, and use server expiry',{skip:!raw},async()=>{
 const db=new Pool({connectionString:assertTestTarget(raw),ssl:false});const actor={channelId:'test-channel',userId:'test-owner'};const suffix=randomUUID().slice(0,8),a='@oa_a_'+suffix,b='@oa_b_'+suffix;let aid='',bid='';
 const previousId=process.env.CONNECTED_LINE_OA_ID,previousToken=process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN;
 const existing=previousId?(await db.query('SELECT id,enabled FROM oa_service_control WHERE line_oa_id=$1',[previousId])).rows[0]:null;
 try{
  if(existing?.enabled)await db.query('UPDATE oa_service_control SET enabled=false WHERE id=$1',[existing.id]);
  const A=await changeOa(db,actor,{action:'add',requestKey:randomUUID(),lineOaId:a,shopName:'ร้าน A',expiresAt:'2030-12-31'});aid=A.id;
  const B=await changeOa(db,actor,{action:'add',requestKey:randomUUID(),lineOaId:b,shopName:'ร้าน B',expiresAt:'2030-12-31'});bid=B.id;
  assert.equal(A.status,'DISABLED');assert.equal(B.status,'DISABLED');
  await assert.rejects(changeOa(db,actor,{action:'add',requestKey:randomUUID(),lineOaId:a,shopName:'ซ้ำ',expiresAt:'2030-12-31'}),(e:unknown)=>e instanceof OwnerError&&e.code==='oa_duplicate');
  const key=randomUUID();const extended=await changeOa(db,actor,{action:'extend30',requestKey:key,id:aid});const replay=await changeOa(db,actor,{action:'extend30',requestKey:key,id:aid});assert.equal(extended.expiresAt.toISOString(),replay.expiresAt.toISOString());
  await assert.rejects(changeOa(db,actor,{action:'extend30',requestKey:key,id:bid}),(e:unknown)=>e instanceof OwnerError&&e.code==='idempotency_conflict');
  const afterB=(await db.query('SELECT enabled,expires_at FROM oa_service_control WHERE id=$1',[bid])).rows[0];assert.equal(afterB.enabled,false);assert.equal(new Date(afterB.expires_at).toISOString(),new Date(B.expiresAt).toISOString());
  process.env.CONNECTED_LINE_OA_ID=a;process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN='isolated-test-token';
  const enabled=await changeOa(db,actor,{action:'enable',requestKey:randomUUID(),id:aid},async()=>require('node:crypto').createHash('sha256').update('isolated-test-token').digest('hex'));assert.equal(enabled.status,'ACTIVE');await requireConnectedOaActive(db);
  await assert.rejects(changeOa(db,actor,{action:'enable',requestKey:randomUUID(),id:bid}),(e:unknown)=>e instanceof OwnerError&&e.code==='oa_binding_unverified');
  const disabled=await changeOa(db,actor,{action:'disable',requestKey:randomUUID(),id:aid});assert.equal(disabled.status,'DISABLED');await assert.rejects(requireConnectedOaActive(db),(e:unknown)=>e instanceof OwnerError&&e.code==='oa_service_inactive');
  const expired=await changeOa(db,actor,{action:'setExpiry',requestKey:randomUUID(),id:aid,expiresAt:'2020-01-01'});assert.equal(expired.status,'DISABLED');
  await assert.rejects(changeOa(db,actor,{action:'enable',requestKey:randomUUID(),id:aid}),(e:unknown)=>e instanceof OwnerError&&e.code==='oa_expired');
  const snapshot=await listOas(db);assert.ok(snapshot.rows.some(x=>x.id===bid&&x.status==='DISABLED'));
  const audit=await db.query('SELECT action FROM oa_service_audit WHERE oa_id=$1',[aid]);assert.deepEqual(audit.rows.map(x=>x.action),['ADD','EXTEND_30_DAYS','ENABLE','DISABLE','SET_EXPIRY']);
 }finally{if(previousId===undefined)delete process.env.CONNECTED_LINE_OA_ID;else process.env.CONNECTED_LINE_OA_ID=previousId;if(previousToken===undefined)delete process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN;else process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN=previousToken;for(const id of [aid,bid])if(id){await db.query('DELETE FROM oa_service_audit WHERE oa_id=$1',[id]);await db.query('DELETE FROM oa_service_control WHERE id=$1',[id])}if(existing?.enabled)await db.query('UPDATE oa_service_control SET enabled=true WHERE id=$1',[existing.id]);await db.end()}
});

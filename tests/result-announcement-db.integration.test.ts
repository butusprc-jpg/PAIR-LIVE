import test from 'node:test';
import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {assertTestTarget} from '../lib/migration-manifest';
import {readResultAnnouncement} from '../lib/rounds/result-announcement';

const raw=process.env.RESULT_ANNOUNCEMENT_TEST_DATABASE_URL;
test('member announcement rejects settlement-only, unverified, cancelled and review results',{skip:!raw},async()=>{
 const pool=new Pool({connectionString:assertTestTarget(raw)}),client=await pool.connect();
 async function insertRound(number:string,status:'SETTLED'|'CANCELLED'|'REVIEW_REQUIRED'){
  const settled=status==='SETTLED';
  const row=(await client.query(`INSERT INTO rounds(round_date,opens_at,closes_at,duration_minutes,status,closed_at,settled_at,result_number,result_last_digit,result_parity,result_confidence,result_verified_at)
   SELECT current_date,t.now-interval '2 minutes',t.now-interval '1 minute',1,$1,t.now-interval '1 minute',
   CASE WHEN $2 THEN t.now END,$3,$4,$5,CASE WHEN $2 THEN 95 END,CASE WHEN $2 THEN t.now END FROM (SELECT clock_timestamp() AS now) t RETURNING id`,
   [status,settled,settled?number:null,settled?number.at(-1):null,settled?(Number(number.at(-1))%2?'ODD':'EVEN'):null])).rows[0];
  return String(row.id);
 }
 async function addEvidence(roundId:string,number:string,verified:boolean){
  await client.query(`INSERT INTO round_ocr_evidence(round_id,frame_id,source_type,captured_at,raw_ocr_text,normalized_text,confidence,original_sha256,crop_sha256,original_object_key,crop_object_key,verification_status,verified_at)
   VALUES($1,$2,'VDO_NINJA',clock_timestamp(),$3,$3,95,$4,$4,'synthetic/full.png','synthetic/crop.png',$5,CASE WHEN $5='VERIFIED' THEN clock_timestamp() END)`,
   [roundId,`synthetic-${randomUUID()}`,number,'a'.repeat(64),verified?'VERIFIED':'PENDING']);
 }
 try{
  await client.query('BEGIN');
  const first=await insertRound('5.8346','SETTLED');
  assert.equal((await readResultAnnouncement(client as unknown as Pool)).announcement,null,'a settled row without verified OCR evidence cannot announce');
  await addEvidence(first,'5.8346',true);
  assert.equal((await readResultAnnouncement(client as unknown as Pool)).announcement,null,'a legacy VERIFIED field without an explicit decision cannot announce');
  await client.query("UPDATE rounds SET settled_at=clock_timestamp()-interval '11 seconds' WHERE id=$1",[first]);
  assert.equal((await readResultAnnouncement(client as unknown as Pool)).announcement,null,'expired announcement stays hidden');
  const second=await insertRound('5.8343','SETTLED');await addEvidence(second,'5.8343',false);
  assert.equal((await readResultAnnouncement(client as unknown as Pool)).announcement,null,'unverified evidence stays hidden');
  await addEvidence(second,'5.8343',true);
  assert.equal((await readResultAnnouncement(client as unknown as Pool)).announcement,null,'settlement does not create an OCR announcement');
  await insertRound('9.9999','CANCELLED');await insertRound('8.8888','REVIEW_REQUIRED');
  assert.equal((await readResultAnnouncement(client as unknown as Pool)).announcement,null,'cancelled and review rounds never announce');
 }finally{await client.query('ROLLBACK').catch(()=>{});client.release();await pool.end()}
});

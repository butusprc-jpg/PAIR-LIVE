import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';

test('candidate lock is unique per round and cannot be changed or forged',async t=>{
 const raw=process.env.OCR_CANDIDATE_TEST_DATABASE_URL;if(!raw){t.skip('isolated PostgreSQL URL not configured');return}
 const url=new URL(raw);if(!['127.0.0.1','localhost','::1'].includes(url.hostname)||url.pathname!=='/pair_live_migration_test')throw new Error('test_target_guard_rejected');
 const pool=new Pool({connectionString:raw,ssl:false,max:2}),client=await pool.connect();
 try{
  await client.query('BEGIN');
  await client.query('CREATE TABLE rounds(id bigint PRIMARY KEY)');
  await client.query('CREATE TABLE oa_service_control(id uuid PRIMARY KEY)');
  await client.query('CREATE TABLE site_cameras(camera_id uuid PRIMARY KEY,oa_id uuid NOT NULL,UNIQUE(oa_id,camera_id))');
  await client.query(await readFile('migrations/047_round_ocr_candidate_lock.sql','utf8'));
  const oa='11111111-1111-4111-8111-111111111111',camera='22222222-2222-4222-8222-222222222222',hash='a'.repeat(64);
  await client.query('INSERT INTO rounds(id) VALUES(1),(2)');await client.query('INSERT INTO oa_service_control(id) VALUES($1)',[oa]);await client.query('INSERT INTO site_cameras(camera_id,oa_id) VALUES($1,$2)',[camera,oa]);
  const values=[1,oa,camera,'5.60','0','EVEN',90,'2026-11-14T00:00:00Z','2026-11-14T00:00:03Z',7,hash];
  const sql='INSERT INTO round_ocr_candidate_locks(round_id,oa_id,camera_id,full_text,last_digit,parity,confidence,first_captured_at,last_captured_at,frame_count,last_frame_sha256) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(round_id) DO NOTHING RETURNING round_id';
  assert.equal((await client.query(sql,values)).rowCount,1);
  assert.equal((await client.query(sql,values)).rowCount,0);
  await client.query('SAVEPOINT immutable');await assert.rejects(client.query("UPDATE round_ocr_candidate_locks SET full_text='3.27' WHERE round_id=1"),/round_ocr_candidate_immutable/);await client.query('ROLLBACK TO SAVEPOINT immutable');
  await client.query('SAVEPOINT parity');await assert.rejects(client.query(sql,[2,oa,camera,'5.60','0','ODD',90,'2026-11-14T00:00:00Z','2026-11-14T00:00:03Z',7,hash]),/check constraint/);await client.query('ROLLBACK TO SAVEPOINT parity');
 }finally{await client.query('ROLLBACK');client.release();await pool.end()}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';

test('camera ROI migration scopes each setting to the camera OA and rejects out-of-frame values',async t=>{
 const url=process.env.OCR_ROI_TEST_DATABASE_URL;
 if(!url){t.skip('isolated PostgreSQL URL not configured');return}
 const parsed=new URL(url);if(!['127.0.0.1','localhost','::1'].includes(parsed.hostname)||parsed.pathname!=='/pair_live_migration_test')throw new Error('test_target_guard_rejected');
 const pool=new Pool({connectionString:url,ssl:false,max:1});const client=await pool.connect();
 try{
  await client.query('BEGIN');
  await client.query('CREATE TABLE admin_identities(id uuid PRIMARY KEY)');
  await client.query('CREATE TABLE site_cameras(camera_id uuid PRIMARY KEY,oa_id uuid NOT NULL,UNIQUE(oa_id,camera_id))');
  await client.query(await readFile('migrations/046_camera_ocr_roi.sql','utf8'));
  const admin='11111111-1111-4111-8111-111111111111',oa='22222222-2222-4222-8222-222222222222',camera='33333333-3333-4333-8333-333333333333';
  await client.query('INSERT INTO admin_identities(id) VALUES($1)',[admin]);
  await client.query('INSERT INTO site_cameras(camera_id,oa_id) VALUES($1,$2)',[camera,oa]);
  await client.query('INSERT INTO camera_ocr_roi(camera_id,oa_id,x,y,width,height,updated_by) VALUES($1,$2,2500,2500,5000,5000,$3)',[camera,oa,admin]);
  assert.equal((await client.query('SELECT x,y,width,height FROM camera_ocr_roi WHERE camera_id=$1',[camera])).rows[0].width,5000);
  await client.query('SAVEPOINT invalid_roi');
  await assert.rejects(client.query('UPDATE camera_ocr_roi SET x=9000,width=2000 WHERE camera_id=$1',[camera]),/check constraint/);
  await client.query('ROLLBACK TO SAVEPOINT invalid_roi');
  await client.query('SAVEPOINT wrong_camera');
  await assert.rejects(client.query('INSERT INTO camera_ocr_roi(camera_id,oa_id,x,y,width,height,updated_by) VALUES(gen_random_uuid(),$1,0,0,100,100,$2)',[oa,admin]),/foreign key/);
  await client.query('ROLLBACK TO SAVEPOINT wrong_camera');
 }finally{await client.query('ROLLBACK');client.release();await pool.end()}
});

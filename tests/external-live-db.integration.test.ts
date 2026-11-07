import test from 'node:test';import assert from 'node:assert/strict';import {Pool} from 'pg';import {assertTestTarget} from '../lib/migration-manifest';
const url=process.env.MIGRATION_TEST_DATABASE_URL;
test('external LIVE setting persists across connections and never mutates round timing',{skip:!url},async()=>{
 const pool=new Pool({connectionString:assertTestTarget(url),ssl:false});const client=await pool.connect();
 try{await client.query('BEGIN');const before=await client.query('SELECT status,embed_url FROM external_live_settings WHERE id=1');assert.equal(before.rows[0].status,'OFFLINE');assert.equal(before.rows[0].embed_url,null);
  const roundBefore=await client.query('SELECT count(*)::int AS total FROM rounds');
  await client.query("UPDATE external_live_settings SET provider='vimeo',embed_url='https://player.vimeo.com/video/12345',status='READY' WHERE id=1");assert.equal((await client.query('SELECT status FROM external_live_settings WHERE id=1')).rows[0].status,'READY');
  await client.query("UPDATE external_live_settings SET status='LIVE' WHERE id=1");assert.equal((await client.query('SELECT status,embed_url FROM external_live_settings WHERE id=1')).rows[0].embed_url,'https://player.vimeo.com/video/12345');
  await client.query("UPDATE external_live_settings SET status='OFFLINE' WHERE id=1");assert.equal((await client.query('SELECT status FROM external_live_settings WHERE id=1')).rows[0].status,'OFFLINE');
  assert.equal((await client.query('SELECT count(*)::int AS total FROM rounds')).rows[0].total,roundBefore.rows[0].total);
  await client.query('COMMIT');
 }catch(error){await client.query('ROLLBACK');throw error}finally{client.release();await pool.end()}
 const fresh=new Pool({connectionString:assertTestTarget(url),ssl:false});try{const saved=(await fresh.query('SELECT status,embed_url FROM external_live_settings WHERE id=1')).rows[0];assert.equal(saved.status,'OFFLINE');assert.equal(saved.embed_url,'https://player.vimeo.com/video/12345')}finally{await fresh.query("UPDATE external_live_settings SET status='OFFLINE',embed_url=NULL,provider=NULL WHERE id=1");await fresh.end()}
});

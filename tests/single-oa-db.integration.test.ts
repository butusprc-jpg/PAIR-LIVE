import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {assertTestTarget,migrationManifest} from '../lib/migration-manifest';

const url=process.env.MIGRATION_TEST_DATABASE_URL;
test('PostgreSQL rejects enabling a second OA without changing its historical record',{skip:!url},async()=>{
 const root=new Pool({connectionString:assertTestTarget(url),ssl:false});
 const schema='single_oa_'+randomUUID().replaceAll('-','');let db:Pool|undefined;
 try{
  await root.query(`CREATE SCHEMA ${schema}`);
  const scoped=new URL(url!);scoped.searchParams.set('options',`-csearch_path=${schema}`);
  db=new Pool({connectionString:scoped.toString(),ssl:false});
  for(const migration of await migrationManifest())await db.query(migration.sql);
  const ids=[];
  for(const shop of ['a','b'])ids.push((await db.query(`INSERT INTO oa_service_control(line_oa_id,shop_name,enabled,expires_at) VALUES($1,$2,false,now()+interval '1 day') RETURNING id`,[`@synthetic-${shop}`,`Synthetic ${shop}`])).rows[0].id);
  await db.query('UPDATE oa_service_control SET enabled=true WHERE id=$1',[ids[0]]);
  await assert.rejects(db.query('UPDATE oa_service_control SET enabled=true WHERE id=$1',[ids[1]]),/oa_single_enabled_guard/);
  assert.deepEqual((await db.query('SELECT enabled FROM oa_service_control ORDER BY line_oa_id')).rows.map(x=>x.enabled),[true,false]);
 }finally{if(db)await db.end();await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await root.end()}
});

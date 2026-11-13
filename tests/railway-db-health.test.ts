import test from 'node:test';
import assert from 'node:assert/strict';
import {databaseConnectionOptions} from '../lib/server/db';
import {readinessStatus} from '../lib/server/readiness';

test('Railway private network uses private transport independently of LINE staging gate',()=>{
 for(const flag of ['true','false']){
  process.env.RAILWAY_STAGING_NO_LINE=flag;
  const options=databaseConnectionOptions('postgresql://synthetic:secret@postgres.railway.internal:5432/railway?sslmode=require');
  assert.equal(options.ssl,false);
  assert.equal(new URL(options.connectionString).searchParams.has('sslmode'),false);
 }
 delete process.env.RAILWAY_STAGING_NO_LINE;
 const publicOptions=databaseConnectionOptions('postgresql://synthetic:secret@example.neon.tech/db?sslmode=disable');
 assert.deepEqual(publicOptions.ssl,{rejectUnauthorized:true});
 assert.equal(new URL(publicOptions.connectionString).searchParams.has('sslmode'),false);
 assert.equal(databaseConnectionOptions('postgresql://synthetic:secret@localhost/db').ssl,false);
});

test('readiness separates database failure and OA binding without echoing errors',async()=>{
 const old={gate:process.env.RAILWAY_STAGING_NO_LINE,mode:process.env.RAILWAY_SINGLE_OA_MODE};
 try{
  delete process.env.RAILWAY_STAGING_NO_LINE;
  process.env.RAILWAY_SINGLE_OA_MODE='true';
  assert.equal(await readinessStatus({query:async()=>{throw new Error('synthetic secret')}} as never),'database_unavailable');
  assert.equal(await readinessStatus({query:async()=>({rows:[]})} as never),'oa_binding_unavailable');
  process.env.RAILWAY_STAGING_NO_LINE='true';
  assert.equal(await readinessStatus({query:async()=>({rows:[]})} as never),'ready');
  assert.equal(await readinessStatus({query:async()=>{throw new Error('synthetic secret')}} as never),'database_unavailable');
 }finally{
  if(old.gate===undefined)delete process.env.RAILWAY_STAGING_NO_LINE;else process.env.RAILWAY_STAGING_NO_LINE=old.gate;
  if(old.mode===undefined)delete process.env.RAILWAY_SINGLE_OA_MODE;else process.env.RAILWAY_SINGLE_OA_MODE=old.mode;
 }
});

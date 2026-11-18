import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import net from 'node:net';
import tls from 'node:tls';
import pg from 'pg';
import {checkRuntimeDbTarget,expectedNeonHost,verifiedClientTls} from '../scripts/check-runtime-db-target.mjs';

const direct='ep-young-violet-azvhetw6.c-3.ap-southeast-1.aws.neon.tech';
const pooler=direct.replace('.c-3.','-pooler.c-3.');
const envFor=(host:string)=>({DATABASE_URL:`postgresql://test:synthetic@${host}/neondb?sslmode=disable`,
 EXPECTED_NEON_HOST:direct,EXPECTED_NEON_DATABASE:'neondb',DB_TARGET_SOURCE:'database',NODE_ENV:'test' as const});

function fakePool(socket:{encrypted:boolean;authorized:boolean;authorizationError?:Error|null},database='neondb'){
 let options:Record<string,unknown>={};
 class Pool{
  constructor(config:Record<string,unknown>){options=config}
  async connect(){return {connection:{stream:socket},query:async()=>({rows:[{database}]}),release(){}}}
  async end(){}
 }
 return {Pool,options:()=>options};
}

test('direct and pooler hosts require verified client TLS and exact database',async()=>{
 for(const host of [direct,pooler]){
  const fake=fakePool({encrypted:true,authorized:true,authorizationError:null});
  const result=await checkRuntimeDbTarget(envFor(host),fake.Pool as unknown as typeof pg.Pool);
  assert.equal(result.matchesExpected,true);
  assert.equal(result.tls,true);
  assert.equal(result.database,'neondb');
  assert.equal((fake.options().ssl as {rejectUnauthorized:boolean}).rejectUnauthorized,true);
  assert.equal(new URL(fake.options().connectionString as string).searchParams.has('sslmode'),false);
 }
});

test('host, database, and certificate failures cannot pass the checker',async()=>{
 assert.equal(expectedNeonHost('ep-other-pooler.c-3.ap-southeast-1.aws.neon.tech',direct),false);
 assert.equal(verifiedClientTls({connection:{stream:{encrypted:true,authorized:false}}}),false);
 for(const [host,socket,database] of [
  [direct,{encrypted:true,authorized:false,authorizationError:new Error('bad certificate')},'neondb'],
  [direct,{encrypted:false,authorized:false},'neondb'],
  [direct,{encrypted:true,authorized:true},'other'],
  ['ep-other.c-3.ap-southeast-1.aws.neon.tech',{encrypted:true,authorized:true},'neondb'],
 ] as const){
  const result=await checkRuntimeDbTarget(envFor(host),fakePool(socket,database).Pool as unknown as typeof pg.Pool);
  assert.equal(result.matchesExpected,false);
 }
});

test('cutover source selects only the cutover URL',async()=>{
 const fake=fakePool({encrypted:true,authorized:true});
 const result=await checkRuntimeDbTarget({...envFor('ep-other.c-3.ap-southeast-1.aws.neon.tech'),
  DB_TARGET_SOURCE:'cutover',NEON_CUTOVER_DATABASE_URL:envFor(pooler).DATABASE_URL},fake.Pool as unknown as typeof pg.Pool);
 assert.equal(result.matchesExpected,true);
 assert.equal(result.dbTargetSource,'cutover');
 assert.equal(new URL(fake.options().connectionString as string).hostname,pooler);
});

test('pg rejects an untrusted TLS certificate before database login',async(t)=>{
 const dir=await mkdtemp(join(tmpdir(),'pair-live-tls-'));
 t.after(async()=>{await rm(dir,{recursive:true,force:true})});
 const cert=join(dir,'cert.pem'),key=join(dir,'key.pem');
 const generated=spawnSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-subj','/CN=localhost',
  '-keyout',key,'-out',cert,'-days','1'],{stdio:'ignore'});
 assert.equal(generated.status,0);
 const context=tls.createSecureContext({key:await readFile(key),cert:await readFile(cert)});
 const sockets=new Set<net.Socket>();
 const server=net.createServer(socket=>{
  sockets.add(socket);
  socket.on('close',()=>sockets.delete(socket));
  socket.once('data',()=>{
   socket.write('S');
   const secure=new tls.TLSSocket(socket,{isServer:true,secureContext:context});
   secure.on('error',()=>{});
  });
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const address=server.address();
 assert.ok(address&&typeof address!=='string');
 const pool=new pg.Pool({connectionString:`postgresql://test:synthetic@127.0.0.1:${address.port}/neondb`,
  ssl:{rejectUnauthorized:true},connectionTimeoutMillis:2000,max:1});
 try{await assert.rejects(pool.connect(),/self-signed|certificate|verify/i)}
 finally{await pool.end();for(const socket of sockets)socket.destroy();await new Promise<void>(resolve=>server.close(()=>resolve()))}
});

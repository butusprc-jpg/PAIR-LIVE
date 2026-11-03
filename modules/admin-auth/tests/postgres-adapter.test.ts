import test from 'node:test';
import assert from 'node:assert/strict';
import type {Pool} from 'pg';
import {createPostgresAdminAdapters} from '../server/postgres';

function harness(rows:unknown[]=[],rowCount=rows.length) {
 const calls:{text:string;values:unknown[]}[]=[];
 const pool={query:async(text:string,values:unknown[]=[])=>{calls.push({text,values});return {rows,rowCount}}} as unknown as Pick<Pool,'query'>;
 return {...createPostgresAdminAdapters(pool),calls};
}

test('PostgreSQL adapter parameterizes hostile provider profile and preserves disabled identity',async()=>{
 const row={id:'id',provider:'line',provider_channel_id:'channel',provider_user_id:'user',display_name:"Robert'); DROP TABLE members; --",avatar_url:null,status:'disabled'};
 const {database,calls}=harness([row]);
 const result=await database.upsertAllowedIdentity({provider:'line',providerChannelId:'channel',providerUserId:'user',displayName:row.display_name,avatarUrl:null},1000);
 assert.equal(result.status,'disabled');
 assert.equal(result.displayName,row.display_name);
 assert.ok(!calls[0].text.includes(row.display_name));
 assert.equal(calls[0].values[3],row.display_name);
 const conflict=calls[0].text.split('DO UPDATE')[1].split('RETURNING')[0];
 assert.ok(!conflict.includes('status='),'logging in must not reactivate disabled admins');
});

test('PostgreSQL session record round-trips timestamps, hashes and revocation',async()=>{
 const hash='a'.repeat(64);
 const {sessionStore,calls}=harness([{token_hash:hash,admin_id:'id',created_at:new Date(1000),expires_at:new Date(2000),revoked_at:new Date(1500)}]);
 assert.deepEqual(await sessionStore.find(hash),{tokenHash:hash,adminId:'id',createdAt:1000,expiresAt:2000,revokedAt:1500});
 assert.deepEqual(calls[0].values,[hash]);
});

test('PostgreSQL missing sessions and identities fail closed',async()=>{
 const {database,sessionStore}=harness();
 assert.equal(await database.findIdentity('missing'),null);
 assert.equal(await sessionStore.find('a'.repeat(64)),null);
});

test('PostgreSQL challenge consumes only one matching unexpired purpose/session with one atomic statement',async()=>{
 const {sessionStore,calls}=harness([{token_hash:'a'.repeat(64)}],1);
 assert.equal(await sessionStore.consumeChallenge('a'.repeat(64),null,'login',1000),true);
 assert.match(calls[0].text,/^DELETE FROM admin_auth_challenges/);
 assert.match(calls[0].text,/session_hash IS NOT DISTINCT FROM \$2::text/);
 assert.match(calls[0].text,/purpose=\$3 AND expires_at>\$4/);
 assert.deepEqual(calls[0].values,['a'.repeat(64),null,'login',new Date(1000)]);
 const missing=harness([],0);
 assert.equal(await missing.sessionStore.consumeChallenge('a'.repeat(64),null,'login',1000),false);
});

test('PostgreSQL audit adapter excludes arbitrary details containing secrets',async()=>{
 const {database,calls}=harness();
 await database.audit({adminId:'id',action:'login',createdAt:1000,details:{accessToken:'never-store-this'}});
 assert.equal(calls[0].values[2],'{}');
 assert.ok(!JSON.stringify(calls).includes('never-store-this'));
});

test('PostgreSQL revocation preserves the first revocation time',async()=>{
 const {sessionStore,calls}=harness();
 await sessionStore.revoke('a'.repeat(64),1000);
 assert.match(calls[0].text,/COALESCE\(revoked_at,\$2\)/);
 assert.deepEqual(calls[0].values,['a'.repeat(64),new Date(1000)]);
});

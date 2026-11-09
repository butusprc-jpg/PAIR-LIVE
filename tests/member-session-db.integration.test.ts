import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {assertTestTarget} from '../lib/migration-manifest';
import {issueSession,rememberSessionSeconds,resolveSession,revokeSession,rotateSession,shortSessionSeconds} from '../lib/server/member-session-store';
import {tokenHash} from '../lib/auth-core';

const raw=process.env.MIGRATION_TEST_DATABASE_URL;
test('PostgreSQL remembered session rotates once across tabs, revokes and isolates accounts',{skip:!raw},async()=>{
 const db=new Pool({connectionString:assertTestTarget(raw),ssl:false,max:5});
 const ids:string[]=[];
 try{
  for(let i=0;i<2;i++){
   const id=(await db.query('INSERT INTO members(display_name) VALUES($1) RETURNING id',[`Synthetic member ${i}`])).rows[0].id;
   ids.push(id);
   await db.query("INSERT INTO member_identities(member_id,provider,provider_channel_id,provider_user_id) VALUES($1,'line','synthetic-session-test',$2)",[id,randomUUID()]);
  }
  const remembered=await issueSession(db,ids[0],true),other=await issueSession(db,ids[1]);
  const expires=(await db.query('SELECT remember_session,extract(epoch from expires_at-now())::int AS seconds FROM member_sessions WHERE token_hash=$1',[tokenHash(remembered)])).rows[0];
  assert.equal(expires.remember_session,true);assert.ok(expires.seconds<=rememberSessionSeconds&&expires.seconds>=rememberSessionSeconds-10);
  const short=(await db.query('SELECT remember_session,extract(epoch from expires_at-now())::int AS seconds FROM member_sessions WHERE token_hash=$1',[tokenHash(other)])).rows[0];
  assert.equal(short.remember_session,false);assert.ok(short.seconds<=shortSessionSeconds&&short.seconds>=shortSessionSeconds-10);
  assert.equal((await resolveSession(db,remembered))?.id,ids[0]);assert.equal((await resolveSession(db,other))?.id,ids[1]);
  await db.query("UPDATE member_sessions SET rotated_at=now()-interval '25 hours' WHERE token_hash=$1",[tokenHash(remembered)]);
  const rotations=await Promise.all([rotateSession(db,remembered),rotateSession(db,remembered)]);
  const rotated=rotations.find(Boolean);assert.ok(rotated);assert.equal(rotations.filter(Boolean).length,1);
  assert.equal((await resolveSession(db,remembered))?.id,ids[0]);assert.equal((await resolveSession(db,rotated.token))?.id,ids[0]);
  assert.equal(await rotateSession(db,rotated.token),null);
  await revokeSession(db,remembered);assert.equal(await resolveSession(db,remembered),null);assert.equal(await resolveSession(db,rotated.token),null);
  const graceToken=await issueSession(db,ids[0],true);await db.query("UPDATE member_sessions SET rotated_at=now()-interval '25 hours' WHERE token_hash=$1",[tokenHash(graceToken)]);
  const graceRotation=await rotateSession(db,graceToken);assert.ok(graceRotation);
  await db.query("UPDATE member_sessions SET previous_valid_until=now()-interval '1 second' WHERE token_hash=$1",[tokenHash(graceRotation.token)]);
  assert.equal(await resolveSession(db,graceToken),null);assert.equal((await resolveSession(db,graceRotation.token))?.id,ids[0]);
  assert.equal((await resolveSession(db,other))?.id,ids[1]);
  await db.query("UPDATE member_sessions SET expires_at=now()-interval '1 second' WHERE token_hash=$1",[tokenHash(other)]);
  assert.equal(await resolveSession(db,other),null);
  const suspendedToken=await issueSession(db,ids[1]);await db.query("UPDATE members SET status='suspended' WHERE id=$1",[ids[1]]);
  assert.equal(await resolveSession(db,suspendedToken),null);
 }finally{for(const id of ids)await db.query('DELETE FROM members WHERE id=$1',[id]);await db.end()}
});

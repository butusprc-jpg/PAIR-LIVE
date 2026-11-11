import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {database} from '../lib/server/db';
import {decideRound,tickRoundEngine} from '../lib/rounds/store';
import {dispatchClosingBroadcast} from '../lib/line/round-broadcast';

test('stop retains points and cancel refunds each entry once under member RLS',
 {skip:!process.env.DATABASE_URL||process.env.PAIR_ROUND_DECISION_TEST_ISOLATED!=='1'},async()=>{
  const {assertTestTarget}=await import('../lib/migration-manifest');assertTestTarget(process.env.DATABASE_URL);
  const db=database(),admin=randomUUID();
  await db.query('TRUNCATE round_line_broadcast_outbox,round_audit_logs,rounds CASCADE');
  const member=(await db.query("INSERT INTO members(display_name,demo_points) VALUES('Decision fixture',500) RETURNING id")).rows[0].id;
  try{
   const round=(await db.query("INSERT INTO rounds(round_date,opens_at,closes_at,duration_minutes,status,even_people,even_points) VALUES((now() AT TIME ZONE 'Asia/Bangkok')::date,now(),now()+interval '5 minutes',5,'OPEN',1,100) RETURNING id")).rows[0];
   const roundId=String(round.id),entryId=randomUUID();
   const connection=await db.connect();try{
    await connection.query('BEGIN');
    await connection.query("SELECT set_config('pair_live.member_id',$1,true)",[member]);
    await connection.query("INSERT INTO round_entries(id,round_id,member_id,side,demo_points,idempotency_key) VALUES($1,$2,$3,'even',100,$4)",[entryId,roundId,member,randomUUID()]);
    await connection.query('UPDATE members SET demo_points=demo_points-100 WHERE id=$1',[member]);
    await connection.query('COMMIT');
   }catch(error){await connection.query('ROLLBACK');throw error}finally{connection.release()}
   await db.query('INSERT INTO round_line_broadcast_outbox(round_id) VALUES($1)',[roundId]);
   const [stopped,replayed]=await Promise.all([decideRound(admin,roundId,'stop'),decideRound(admin,roundId,'stop')]);
   assert.deepEqual([stopped.replayed,replayed.replayed].sort(),[false,true]);
   assert.equal((await db.query('SELECT demo_points FROM members WHERE id=$1',[member])).rows[0].demo_points,400);
   assert.equal((await db.query('SELECT closed_at IS NOT NULL AS closed FROM rounds WHERE id=$1',[roundId])).rows[0].closed,true);
   assert.equal((await tickRoundEngine()).round?.status,'SCANNING');
   let sends=0;await dispatchClosingBroadcast(db,'test',async()=>{sends++;throw Error('unexpected LINE request')});
   assert.equal(sends,0);
   const [cancelled,cancelReplay]=await Promise.all([decideRound(admin,roundId,'cancel'),decideRound(admin,roundId,'cancel')]);
   assert.deepEqual([cancelled.replayed,cancelReplay.replayed].sort(),[false,true]);
   assert.equal((await db.query('SELECT demo_points FROM members WHERE id=$1',[member])).rows[0].demo_points,500);
   assert.equal((await db.query("SELECT count(*)::int AS n FROM round_audit_logs WHERE round_id=$1 AND action='ROUND_CANCELLED'",[roundId])).rows[0].n,1);
   const check=await db.connect();try{await check.query('BEGIN');await check.query("SELECT set_config('pair_live.member_id',$1,true)",[member]);assert.equal((await check.query('SELECT status FROM round_entries WHERE id=$1',[entryId])).rows[0].status,'CANCELLED');await check.query('ROLLBACK')}finally{check.release()}
   const inconsistent=(await db.query("INSERT INTO rounds(round_date,opens_at,closes_at,duration_minutes,status,odd_people,odd_points) VALUES((now() AT TIME ZONE 'Asia/Bangkok')::date,now(),now()+interval '5 minutes',5,'OPEN',1,50) RETURNING id")).rows[0].id;
   await assert.rejects(decideRound(admin,String(inconsistent),'cancel'),/round_entries_mismatch/);
   assert.equal((await db.query('SELECT status FROM rounds WHERE id=$1',[inconsistent])).rows[0].status,'OPEN');
   assert.equal((await db.query('SELECT demo_points FROM members WHERE id=$1',[member])).rows[0].demo_points,500);
  }finally{await db.query('TRUNCATE round_line_broadcast_outbox,round_audit_logs,rounds CASCADE');await db.query('DELETE FROM members WHERE id=$1',[member]);await db.end()}
 });

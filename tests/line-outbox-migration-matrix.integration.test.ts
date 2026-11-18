import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {assertTestTarget,migrationManifest} from '../lib/migration-manifest';

const raw=process.env.LINE_OUTBOX_MIGRATION_TEST_DATABASE_URL;
test('migration 052 retains old rows and quarantines attempted payloadless member jobs',{skip:!raw},async()=>{
 const root=new Pool({connectionString:assertTestTarget(raw)}),schema='outbox_matrix_'+randomUUID().replaceAll('-','');let db:Pool|undefined,createdPublicBinding=false;
 try{
  if(!(await root.query("SELECT to_regclass('public.external_live_role_bindings') AS existing")).rows[0].existing){await root.query('CREATE TABLE public.external_live_role_bindings(role_name name,oa_id uuid)');createdPublicBinding=true}
  await root.query(`CREATE SCHEMA ${schema}`);const url=new URL(raw!);url.searchParams.set('options',`-csearch_path=${schema}`);db=new Pool({connectionString:url.toString()});
  const migrations=await migrationManifest(),localeIndex=migrations.findIndex(item=>item.path==='migrations/051_member_notification_locale.sql');
  assert.ok(localeIndex>=0);for(const item of migrations.slice(0,localeIndex))await db.query(item.sql);
  const legacy=(await db.query("INSERT INTO members(display_name) VALUES('Synthetic old member') RETURNING id")).rows[0].id;
  await db.query(migrations[localeIndex].sql);
  assert.deepEqual((await db.query('SELECT notification_locale,notification_locale_source FROM members WHERE id=$1',[legacy])).rows[0],{notification_locale:'th',notification_locale_source:'default'});
  const other=(await db.query("INSERT INTO members(display_name) VALUES('Synthetic second member') RETURNING id")).rows[0].id;
  await db.query("UPDATE members SET notification_locale='zh-CN',notification_locale_source='choice' WHERE id=$1",[legacy]);
  assert.equal((await db.query('SELECT notification_locale FROM members WHERE id=$1',[other])).rows[0].notification_locale,'th');
  const user='U'+'a'.repeat(32),oa=randomUUID();
  const client=await db.connect();try{
   await client.query('BEGIN');await client.query('SET LOCAL session_replication_role=replica'); // synthetic pre-migration FK references only
   for(const [index,status] of ['PENDING','FAILED','SENDING','SENT'].entries()){
    const attempted=status!=='PENDING',lease=status==='SENDING'?new Date():null,sent=status==='SENT'?new Date():null;
    await client.query('INSERT INTO live_start_line_outbox(event_id,member_id,oa_id,recipient_user_id,status,attempts,lease_until,sent_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[randomUUID(),randomUUID(),oa,user,status,attempted?1:0,lease,sent]);
    await client.query('INSERT INTO round_countdown_line_outbox(round_id,member_id,oa_id,recipient_user_id,status,attempts,lease_until,sent_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[String(9000+index),randomUUID(),oa,user,status,attempted?1:0,lease,sent]);
    await client.query('INSERT INTO round_result_line_outbox(entry_id,round_id,member_id,oa_id,recipient_user_id,status,attempts,lease_until,sent_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[randomUUID(),String(9100+index),randomUUID(),oa,user,status,attempted?1:0,lease,sent]);
   }
   await client.query("INSERT INTO round_result_line_outbox(entry_id,round_id,member_id,oa_id,status,attempts,last_error) VALUES($1,9199,$2,$3,'UNDELIVERABLE',5,'line_identity_missing')",[randomUUID(),randomUUID(),oa]);
   for(const [index,status] of ['PENDING','RETRY','PROCESSING','SENT','FAILED'].entries()){
    const attempted=status!=='PENDING',lease=status==='PROCESSING'?new Date():null,sent=status==='SENT'?new Date():null;
    await client.query('INSERT INTO member_topup_member_notifications(request_id,member_id,recipient_user_id,approved_points,status,attempts,lease_until,sent_at) VALUES($1,$2,$3,100,$4,$5,$6,$7)',[randomUUID(),randomUUID(),user,status,status==='FAILED'?5:attempted?1:0,lease,sent]);
    await client.query("INSERT INTO member_withdrawal_line_outbox(request_id,recipient_user_id,purpose,status,attempts,lease_until,sent_at) VALUES($1,$2,'MEMBER_REJECTED',$3,$4,$5,$6)",[randomUUID(),user,status,status==='FAILED'?5:attempted?1:0,lease,sent]);
    if(index===1)await client.query("INSERT INTO member_withdrawal_line_outbox(request_id,recipient_user_id,purpose,status,attempts) VALUES($1,$2,'ADMIN_REQUEST','RETRY',1)",[randomUUID(),user]);
   }
   await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
  const tables=['live_start_line_outbox','round_countdown_line_outbox','round_result_line_outbox','member_topup_member_notifications','member_withdrawal_line_outbox'] as const;
  const counts=async()=>Object.fromEntries(await Promise.all(tables.map(async table=>[table,(await db!.query(`SELECT status,count(*)::int AS count FROM ${table} GROUP BY status ORDER BY status`)).rows] as const)));
  const before=await counts();await db.query(migrations.at(-1)!.sql);const after=await counts();
  for(const table of tables){const sum=(rows:{count:number}[])=>rows.reduce((total,row)=>total+row.count,0);assert.equal(sum(after[table]),sum(before[table]),table);assert.equal(after[table].find(row=>row.status==='SENT')?.count,before[table].find(row=>row.status==='SENT')?.count,table)}
  assert.equal((after.live_start_line_outbox.find(row=>row.status==='FAILED')?.count),2);
  assert.equal((after.round_countdown_line_outbox.find(row=>row.status==='FAILED')?.count),2);
  assert.equal((after.round_result_line_outbox.find(row=>row.status==='UNDELIVERABLE')?.count),3);
  assert.equal((after.member_topup_member_notifications.find(row=>row.status==='FAILED')?.count),3);
  assert.equal((after.member_withdrawal_line_outbox.find(row=>row.status==='FAILED')?.count),3);
  assert.equal((after.member_withdrawal_line_outbox.find(row=>row.status==='RETRY')?.count),1); // admin request unchanged
  for(const table of tables){const attempted:number=Number((await db.query(`SELECT count(*)::int AS count FROM ${table} WHERE last_error='payload_snapshot_review_required' AND attempts=5 AND payload_messages IS NULL`)).rows[0].count);assert.equal(attempted,2,table)}
  assert.equal((await db.query("SELECT last_error FROM round_result_line_outbox WHERE status='UNDELIVERABLE' AND last_error='line_identity_missing'")).rowCount,1);
  console.log('old_outbox_before',JSON.stringify(before));console.log('old_outbox_after',JSON.stringify(after));
 }finally{await db?.end();await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);if(createdPublicBinding)await root.query('DROP TABLE public.external_live_role_bindings');await root.end()}
});

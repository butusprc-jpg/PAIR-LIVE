import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {financialReportRoles,readFinancialReport,readRoundParticipationReport,roundReportRoles} from '../lib/admin-reports';
import {roleAllowed} from '../modules/admin-auth/server/guard';
import {assertTestTarget,migrationManifest} from '../lib/migration-manifest';

test('report access separates financial data from round data',()=>{
 assert.equal(roleAllowed('admin',financialReportRoles),true);
 for(const role of ['operator','viewer'] as const){assert.equal(roleAllowed(role,financialReportRoles),false);assert.equal(roleAllowed(role,roundReportRoles),true)}
});

const raw=process.env.TOPUP_TEST_DATABASE_URL;
test('PostgreSQL reports use only stored requests, decisions, and round entries',{skip:!raw},async()=>{
 const root=new Pool({connectionString:assertTestTarget(raw),max:2});
 const schema='admin_report_test_'+randomUUID().replaceAll('-','');let db:Pool|undefined;
 try{
  await root.query(`CREATE SCHEMA ${schema}`);
  const url=new URL(raw!);url.searchParams.set('options',`-csearch_path=${schema}`);
  db=new Pool({connectionString:url.toString(),max:2});
  for(const migration of await migrationManifest())await db.query(migration.sql);
  const member=(await db.query("INSERT INTO members(display_name) VALUES('Synthetic report fixture') RETURNING id")).rows[0].id;
  const other=(await db.query("INSERT INTO members(display_name) VALUES('Second synthetic fixture') RETURNING id")).rows[0].id;
  const admin=(await db.query("INSERT INTO admin_identities(provider,provider_channel_id,provider_user_id,display_name) VALUES('line','test',$1,'Report Admin') RETURNING id",['U'+'d'.repeat(32)])).rows[0].id;
  const topup=(await db.query('INSERT INTO member_topup_requests(member_id,requested_points,idempotency_key) VALUES($1,40,$2) RETURNING id',[member,randomUUID()])).rows[0].id;
  await db.query("UPDATE member_topup_requests SET status='APPROVED',approved_at=now(),approved_by=$2 WHERE id=$1",[topup,admin]);
  await db.query("INSERT INTO member_topup_audit(request_id,member_id,admin_id,action,points,balance_before,balance_after,admin_note) VALUES($1,$2,$3,'APPROVED',40,100,140,'')",[topup,member,admin]);
  const withdrawal=(await db.query("INSERT INTO member_withdrawal_requests(member_id,requested_points,payout_details,idempotency_key,debit_timing) VALUES($1,15,'synthetic only',$2,'ON_APPROVAL') RETURNING id",[member,randomUUID()])).rows[0].id;
  await db.query("UPDATE member_withdrawal_requests SET status='REJECTED',decided_at=now(),decided_by=$2 WHERE id=$1",[withdrawal,admin]);
  await db.query("INSERT INTO member_withdrawal_audit(request_id,member_id,admin_id,action,points) VALUES($1,$2,$3,'REJECTED',15)",[withdrawal,member,admin]);
  await db.query("INSERT INTO member_withdrawal_requests(member_id,requested_points,payout_details,idempotency_key,debit_timing) VALUES($1,20,'synthetic only',$2,'ON_APPROVAL')",[member,randomUUID()]);
  const round=(await db.query("INSERT INTO rounds(round_date,opens_at,closes_at,duration_minutes,status,settled_at) VALUES(current_date,now()-interval '10 minutes',now()-interval '5 minutes',5,'SETTLED',now()) RETURNING id")).rows[0].id;
  for(const [person,side,points,status] of [[member,'even',10,'PENDING'],[member,'odd',20,'PENDING'],[other,'even',30,'CANCELLED']] as const)await db.query('INSERT INTO round_entries(round_id,member_id,side,demo_points,idempotency_key,status) VALUES($1,$2,$3,$4,$5,$6)',[round,person,side,points,randomUUID(),status]);
  const finance=await readFinancialReport(db);
  assert.equal(finance.items.length,3);
  assert.deepEqual(finance.totals,{topup:40,withdrawal:35});
  assert.equal(finance.approvals.length,2);
  assert.deepEqual(new Set(finance.approvals.map(item=>item.decision)),new Set(['APPROVED','REJECTED']));
  assert.ok(finance.approvals.every(item=>item.approvedBy==='Report Admin'));
  assert.doesNotMatch(JSON.stringify(finance),/Synthetic report fixture|synthetic only/);
  const rounds=await readRoundParticipationReport(db);
  assert.deepEqual(rounds.items[0],{roundId:String(round),opensAt:rounds.items[0].opensAt,status:'SETTLED',participants:1,evenPoints:10,oddPoints:20});
  assert.equal((await db.query('SELECT status FROM member_withdrawal_requests WHERE id=$1',[withdrawal])).rows[0].status,'REJECTED');
 }finally{await db?.end();await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await root.end()}
});

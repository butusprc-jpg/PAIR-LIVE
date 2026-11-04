import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {assertTestTarget,migrationManifest} from '../lib/migration-manifest';
import {createTopup,decideTopup,listTopups,validatePoints} from '../lib/topup/store';
import {imageType} from '../lib/topup/qr';
test('topup points reject invalid numbers and enforce server cap',()=>{for(const n of [0,-1,1.1,'1',NaN,Infinity,100001])assert.throws(()=>validatePoints(n));assert.equal(validatePoints(1),1)});
test('QR rejects renamed text, SVG and oversized payloads',()=>{for(const b of [Buffer.from('<svg/>'),Buffer.from('fake.png'),Buffer.alloc(2097153)])assert.throws(()=>imageType(b))});
const raw=process.env.TOPUP_TEST_DATABASE_URL;
test('PostgreSQL topup replay, concurrent approvals, rollback, terminal states and RLS',{skip:!raw},async()=>{
 const pool=new Pool({connectionString:assertTestTarget(raw),max:12});const schema='topup_test_'+randomUUID().replaceAll('-','');let db:Pool|undefined;
 try{await pool.query(`CREATE SCHEMA ${schema}`);const url=new URL(raw!);url.searchParams.set('options',`-csearch_path=${schema}`);db=new Pool({connectionString:url.toString(),max:12});for(const m of await migrationManifest())await db.query(m.sql);
 const member=(await db.query("INSERT INTO members(display_name,demo_points) VALUES('Synthetic topup member',100) RETURNING id")).rows[0].id;
 const other=(await db.query("INSERT INTO members(display_name) VALUES('Synthetic other') RETURNING id")).rows[0].id;
 const admins=(await db.query("INSERT INTO admin_identities(provider,provider_channel_id,provider_user_id,display_name) VALUES('line','test','test-a','Admin A'),('line','test','test-b','Admin B') RETURNING id")).rows;
 const key=randomUUID();const requests=await Promise.all(Array.from({length:8},()=>createTopup(db!,member,50,key)));assert.equal(new Set(requests.map(r=>r.id)).size,1);await assert.rejects(createTopup(db,member,51,key),/idempotency_conflict/);
 const id=requests[0].id;await Promise.all(Array.from({length:12},(_,i)=>decideTopup(db!,admins[i%2].id,id,'APPROVED','manual synthetic check')));
 assert.equal((await db.query('SELECT demo_points FROM members WHERE id=$1',[member])).rows[0].demo_points,150);assert.equal((await db.query('SELECT count(*)::int n FROM member_topup_audit')).rows[0].n,1);assert.equal((await db.query('SELECT count(*)::int n FROM member_wallets')).rows[0].n,0);
 await decideTopup(db,admins[0].id,id,'APPROVED','replay after lost response');await assert.rejects(decideTopup(db,admins[0].id,id,'REJECTED',''),/terminal_status/);
 const rejected=await createTopup(db,member,20,randomUUID());await decideTopup(db,admins[0].id,rejected.id,'REJECTED','no slip');await assert.rejects(decideTopup(db,admins[1].id,rejected.id,'APPROVED',''),/terminal_status/);
 const rollback=await createTopup(db,member,25,randomUUID());await db.query("CREATE FUNCTION fail_topup_audit() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'forced_audit_failure'; END$$");await db.query('CREATE TRIGGER force_failure BEFORE INSERT ON member_topup_audit FOR EACH ROW EXECUTE FUNCTION fail_topup_audit()');await assert.rejects(decideTopup(db,admins[0].id,rollback.id,'APPROVED',''),/forced_audit_failure/);await db.query('DROP TRIGGER force_failure ON member_topup_audit');assert.equal((await db.query('SELECT demo_points FROM members WHERE id=$1',[member])).rows[0].demo_points,150);assert.equal((await listTopups(db,member)).find(r=>r.id===rollback.id).status,'PENDING');
 await db.query("UPDATE members SET status='suspended' WHERE id=$1",[member]);await assert.rejects(decideTopup(db,admins[0].id,rollback.id,'APPROVED',''),/member_suspended/);await assert.rejects(async()=>createTopup(db!,member,0,randomUUID()),/invalid_points/);await db.query("UPDATE members SET status='active' WHERE id=$1",[member]);
 const oldCap=process.env.TOPUP_MAX_POINTS;try{process.env.TOPUP_MAX_POINTS='10';await assert.rejects(decideTopup(db,admins[0].id,rollback.id,'APPROVED',''),/invalid_points/);await decideTopup(db,admins[0].id,rollback.id,'REJECTED','over current limit')}finally{if(oldCap===undefined)delete process.env.TOPUP_MAX_POINTS;else process.env.TOPUP_MAX_POINTS=oldCap}
 assert.equal((await listTopups(db,other)).length,0);await assert.rejects(decideTopup(db,randomUUID(),rollback.id,'APPROVED',''),/admin_forbidden/);
 await assert.rejects(db.query("UPDATE member_topup_requests SET status='PENDING' WHERE id=$1",[id]),/topup_immutable/);await assert.rejects(db.query('DELETE FROM member_topup_audit'),/topup_immutable/);
 assert.deepEqual((await db.query('SELECT phase,enabled,ever_cutover FROM member_wallet_runtime_state WHERE id=1')).rows[0],{phase:'LEGACY',enabled:false,ever_cutover:false});
 // Verify policies as a non-owner; application queries additionally scope every read.
 const c=await db.connect();const role='topup_reader_'+randomUUID().replaceAll('-','');try{await c.query('BEGIN');await c.query(`CREATE ROLE ${role} NOLOGIN`);await c.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`);await c.query(`GRANT SELECT ON member_topup_requests,member_topup_audit TO ${role}`);await c.query(`SET LOCAL ROLE ${role}`);await c.query("SELECT set_config('pair_live.member_id',$1,true)",[other]);assert.equal((await c.query('SELECT * FROM member_topup_requests')).rowCount,0);assert.equal((await c.query('SELECT * FROM member_topup_audit')).rowCount,0)}finally{await c.query('ROLLBACK');c.release()}
 }finally{await db?.end();await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await pool.end()}
});

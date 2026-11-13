import test from 'node:test';
import {createExternalQrToken,verifyExternalQrToken} from '../lib/topup/external-qr';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {assertTestTarget,migrationManifest} from '../lib/migration-manifest';
import {createTopup,createTopupWithSlip,decideTopup,listTopups,validatePoints} from '../lib/topup/store';
import {imageType} from '../lib/topup/qr';
import {validateSlip} from '../lib/topup/slip';
import {lineAdminRecipients,dispatchTopupLine} from '../lib/topup/line-notify';
import {processTopupPostback} from '../lib/topup/line-postback';
import {confirmationData} from '../lib/topup/line-card';
import {dispatchApprovedMemberLine} from '../lib/topup/member-line-notify';
import {cleanupTopupTemporary} from '../lib/topup/retention';
import {historyCsv,historySummary,historyFilter} from '../lib/topup/export';
test('LINE admin recipients only include validated admin roles',()=>{
 const u='U'+'a'.repeat(32),viewer='U'+'b'.repeat(32);
 assert.deepEqual(lineAdminRecipients(JSON.stringify([{userId:u,role:'admin'},{userId:viewer,role:'viewer'},{userId:u,role:'admin'},{userId:'bad',role:'admin'}])),[u]);
 assert.deepEqual(lineAdminRecipients('invalid'),[]);
});
test('external QR links expire and reject tampering',()=>{
 const secret='synthetic-only-signing-secret',now=1793770000;
 const token=createExternalQrToken(secret,now);
 assert.equal(verifyExternalQrToken(String(token.expires),token.signature,secret,now),true);
 assert.equal(verifyExternalQrToken(String(token.expires),token.signature,secret,now+181),false);
 assert.equal(verifyExternalQrToken(String(token.expires+400),token.signature,secret,now),false);
 assert.equal(verifyExternalQrToken(String(token.expires),'0'.repeat(64),secret,now),false);
 assert.equal(verifyExternalQrToken('bad',token.signature,secret,now),false);
});
test('topup points reject invalid numbers and enforce server cap',()=>{for(const n of [0,-1,1.1,'1',NaN,Infinity,100001])assert.throws(()=>validatePoints(n));assert.equal(validatePoints(1),1)});
test('slip rejects renamed text and invalid data',async()=>{await assert.rejects(validateSlip(Buffer.from('not-image')));});
test('QR rejects renamed text, SVG and oversized payloads',()=>{for(const b of [Buffer.from('<svg/>'),Buffer.from('fake.png'),Buffer.alloc(2097153)])assert.throws(()=>imageType(b))});
const raw=process.env.TOPUP_TEST_DATABASE_URL;
test('PostgreSQL topup replay, concurrent approvals, rollback, terminal states and RLS',{skip:!raw},async()=>{
 const pool=new Pool({connectionString:assertTestTarget(raw),max:12});const schema='topup_test_'+randomUUID().replaceAll('-','');let db:Pool|undefined;
 try{await pool.query(`CREATE SCHEMA ${schema}`);const url=new URL(raw!);url.searchParams.set('options',`-csearch_path=${schema}`);db=new Pool({connectionString:url.toString(),max:12});for(const m of await migrationManifest())await db.query(m.sql);
 const member=(await db.query("INSERT INTO members(display_name,demo_points) VALUES('Synthetic topup member',100) RETURNING id")).rows[0].id;
 const other=(await db.query("INSERT INTO members(display_name,demo_points) VALUES('Synthetic other',1250) RETURNING id")).rows[0].id;
 const admins=(await db.query("INSERT INTO admin_identities(provider,provider_channel_id,provider_user_id,display_name) VALUES('line','test','test-a','Admin A'),('line','test','test-b','Admin B') RETURNING id")).rows;
 const slipKey=randomUUID(),slipSha='a'.repeat(64);
 const slip={objectKey:'topup-slips/'+member+'/'+slipKey,type:'image/jpeg',sha:slipSha};
 const lineRecipient='U'+'a'.repeat(32);
 const verified=await createTopupWithSlip(db,member,32,slipKey,slip,[lineRecipient]);
 assert.equal(verified.slip_sha256,slipSha);
 assert.equal((await db.query('SELECT count(*)::int n FROM member_topup_line_notifications WHERE request_id=$1',[verified.id])).rows[0].n,1);
 process.env.LINE_LOGIN_CHANNEL_ID='test';process.env.LINE_MESSAGING_CHANNEL_ID='different-messaging-channel';process.env.LINE_LOGIN_PROVIDER_ID='synthetic-provider';process.env.LINE_MESSAGING_PROVIDER_ID='synthetic-provider';
 assert.deepEqual(await dispatchTopupLine(db,{token:''}),{configured:false,sent:0,pending:0,failed:0});
 // Sending a notification must not depend on postback/login provider configuration.
 delete process.env.LINE_LOGIN_PROVIDER_ID;delete process.env.LINE_MESSAGING_PROVIDER_ID;
 const captures:{url:string;init:RequestInit}[]=[];
 const sent=await dispatchTopupLine(db,{token:'synthetic-test-token',origin:'https://pair-live.vercel.app',fetch:async(url,init)=>{captures.push({url:String(url),init:init||{}});return new Response('',{status:200})}});
 assert.equal(sent.sent,1);
 process.env.LINE_LOGIN_PROVIDER_ID='synthetic-provider';process.env.LINE_MESSAGING_PROVIDER_ID='synthetic-provider';
 assert.equal(captures.length,1);
 assert.match(String(captures[0].init.body),/32 แต้ม/);
 assert.match(String(captures[0].init.body),/ตรวจหลักฐานตามช่องทางที่ได้รับ/);
 assert.equal((await db.query("SELECT status FROM member_topup_line_notifications WHERE request_id=$1",[verified.id])).rows[0].status,'SENT');
 assert.equal((await dispatchTopupLine(db,{token:'synthetic-test-token',fetch:async()=>{throw new Error('unexpected_duplicate')}})).sent,0);
 const imageKey=randomUUID();const imageRequest=await createTopupWithSlip(db,member,31,imageKey,{objectKey:'topup-slips/'+member+'/'+imageKey,type:'image/png',sha:'f'.repeat(64)},[lineRecipient]);
 const oldSigning=process.env.TOPUP_IMAGE_SIGNING_SECRET;process.env.TOPUP_IMAGE_SIGNING_SECRET='synthetic-32-byte-secret-for-card-tests';
 try{const sample=await readFile('tests/fixtures/scale/136.20.png');const imageSent=await dispatchTopupLine(db,{token:'synthetic-test-token',origin:'https://pair-live.example',loadSlip:async()=>({data:sample,type:'image/png'}),fetch:async(_url,init)=>{captures.push({url:String(_url),init:init||{}});return new Response('',{status:200})}});assert.equal(imageSent.sent,1);const imagePayload=JSON.parse(String(captures.at(-1)!.init.body));assert.equal(imagePayload.messages[0].type,'flex');const imageUrl=imagePayload.messages[0].contents.hero.url;assert.match(imageUrl,/https:\/\/pair-live.example\/api\/line\/topup-image/);assert.equal(imagePayload.messages[0].contents.footer.contents[0].action.type,'postback');assert.equal(imagePayload.messages[0].contents.footer.contents[0].action.data,`topup:v2:review:APPROVED:${imageRequest.id}`);assert.doesNotMatch(JSON.stringify(imagePayload),/admin\/topup-review/);assert.equal(imageRequest.id!==verified.id,true)}finally{if(oldSigning===undefined)delete process.env.TOPUP_IMAGE_SIGNING_SECRET;else process.env.TOPUP_IMAGE_SIGNING_SECRET=oldSigning}

 assert.equal((await createTopupWithSlip(db,member,32,slipKey,slip,[lineRecipient])).id,verified.id);
 assert.equal((await db.query('SELECT count(*)::int n FROM member_topup_line_notifications WHERE request_id=$1',[verified.id])).rows[0].n,1);
 await assert.rejects(createTopupWithSlip(db,member,33,slipKey,slip),/idempotency_conflict/);
 await assert.rejects(createTopupWithSlip(db,member,32,slipKey,{...slip,sha:'b'.repeat(64)}),/idempotency_conflict/);
 assert.equal((await listTopups(db,member)).find(r=>r.id===verified.id).has_slip,true);
 const key=randomUUID();const requests=await Promise.all(Array.from({length:8},()=>createTopup(db!,member,50,key,[lineRecipient])));assert.equal(new Set(requests.map(r=>r.id)).size,1);assert.equal((await db.query('SELECT count(*)::int n FROM member_topup_line_notifications WHERE request_id=$1',[requests[0].id])).rows[0].n,1);await assert.rejects(createTopup(db,member,51,key),/idempotency_conflict/);
 const id=requests[0].id;await Promise.all(Array.from({length:12},(_,i)=>decideTopup(db!,admins[i%2].id,id,'APPROVED','manual synthetic check')));
 assert.equal((await db.query('SELECT demo_points FROM members WHERE id=$1',[member])).rows[0].demo_points,150);assert.equal((await db.query('SELECT count(*)::int n FROM member_topup_audit')).rows[0].n,1);assert.equal((await db.query('SELECT count(*)::int n FROM member_wallets')).rows[0].n,0);
 await decideTopup(db,admins[0].id,id,'APPROVED','replay after lost response');await assert.rejects(decideTopup(db,admins[0].id,id,'REJECTED',''),/terminal_status/);
 const rejected=await createTopup(db,member,20,randomUUID());await decideTopup(db,admins[0].id,rejected.id,'REJECTED','no slip');await assert.rejects(decideTopup(db,admins[1].id,rejected.id,'APPROVED',''),/terminal_status/);
 const rollback=await createTopup(db,member,25,randomUUID());await db.query("CREATE FUNCTION fail_topup_audit() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'forced_audit_failure'; END$$");await db.query('CREATE TRIGGER force_failure BEFORE INSERT ON member_topup_audit FOR EACH ROW EXECUTE FUNCTION fail_topup_audit()');await assert.rejects(decideTopup(db,admins[0].id,rollback.id,'APPROVED',''),/forced_audit_failure/);await db.query('DROP TRIGGER force_failure ON member_topup_audit');assert.equal((await db.query('SELECT demo_points FROM members WHERE id=$1',[member])).rows[0].demo_points,150);assert.equal((await listTopups(db,member)).find(r=>r.id===rollback.id).status,'PENDING');
 await db.query("UPDATE members SET status='suspended' WHERE id=$1",[member]);await assert.rejects(decideTopup(db,admins[0].id,rollback.id,'APPROVED',''),/member_suspended/);await assert.rejects(async()=>createTopup(db!,member,0,randomUUID()),/invalid_points/);await db.query("UPDATE members SET status='active' WHERE id=$1",[member]);
 const oldCap=process.env.TOPUP_MAX_POINTS;try{process.env.TOPUP_MAX_POINTS='10';await assert.rejects(decideTopup(db,admins[0].id,rollback.id,'APPROVED',''),/invalid_points/);await decideTopup(db,admins[0].id,rollback.id,'REJECTED','over current limit')}finally{if(oldCap===undefined)delete process.env.TOPUP_MAX_POINTS;else process.env.TOPUP_MAX_POINTS=oldCap}
 const prior={token:process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN,login:process.env.LINE_LOGIN_CHANNEL_ID,messaging:process.env.LINE_MESSAGING_CHANNEL_ID,secret:process.env.TOPUP_IMAGE_SIGNING_SECRET};
 try{
  process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN='synthetic-token';process.env.LINE_LOGIN_CHANNEL_ID='test';process.env.LINE_MESSAGING_CHANNEL_ID='different-messaging-channel';process.env.TOPUP_IMAGE_SIGNING_SECRET='synthetic-32-byte-secret-for-card-tests';
  const adminA='U'+'a'.repeat(32),adminB='U'+'b'.repeat(32),outsider='U'+'c'.repeat(32);
  const realAdmins=(await db.query("INSERT INTO admin_identities(provider,provider_channel_id,provider_user_id,display_name) VALUES('line','test',$1,'Admin A'),('line','test',$2,'Admin B') RETURNING id",[adminA,adminB])).rows;
  const chatMember=(await db.query("INSERT INTO members(display_name,demo_points) VALUES('Synthetic chat member',100) RETURNING id")).rows[0].id;
  const memberLine='U'+'d'.repeat(32);
  await db.query("INSERT INTO member_identities(member_id,provider,provider_channel_id,provider_user_id) VALUES($1,'line','test',$2)",[chatMember,memberLine]);
  const pending=await createTopup(db,chatMember,500,randomUUID());
  const seen:{to:string;text:string}[]=[];const fakeFetch:typeof fetch=async(_url,init)=>{const payload=JSON.parse(String(init?.body));seen.push({to:payload.to,text:JSON.stringify(payload.messages[0])});return new Response('',{status:200})};
  const allow=JSON.stringify([{userId:adminA,role:'admin'},{userId:adminB,role:'admin'},{userId:outsider,role:'viewer'}]);
  // Outbound and admin postbacks need a verified LINE user match, not redundant Provider IDs.
  delete process.env.LINE_LOGIN_PROVIDER_ID;delete process.env.LINE_MESSAGING_PROVIDER_ID;
  const run=(eventId:string,userId:string,data:string)=>processTopupPostback(db!,{webhookEventId:eventId,type:'postback',userId,data},{fetch:fakeFetch,allowlist:allow});
  const denied=await run('denied-synthetic',outsider,`topup:v2:review:APPROVED:${pending.id}`);assert.equal(denied.result,'FORBIDDEN');
  assert.equal((await db.query('SELECT demo_points FROM members WHERE id=$1',[chatMember])).rows[0].demo_points,100);
  const [first,second]=await Promise.all([run('review-synthetic',adminA,`topup:v2:review:APPROVED:${pending.id}`),run('review-synthetic-b',adminB,`topup:v2:review:APPROVED:${pending.id}`)]);
  assert.deepEqual([first.result,second.result].sort(),['ALREADY_HANDLED','APPROVED']);
  assert.equal((await db.query('SELECT demo_points FROM members WHERE id=$1',[chatMember])).rows[0].demo_points,600);
  assert.equal((await db.query('SELECT count(*)::int n FROM member_topup_audit WHERE request_id=$1',[pending.id])).rows[0].n,1);
  assert.equal(seen.filter(x=>x.to===memberLine&&x.text.includes('500 แต้ม')).length,1);
  assert.ok(seen.some(x=>x.to===adminA&&x.text.includes('อนุมัติแล้ว')));
  assert.ok(seen.some(x=>x.to===adminA&&x.text.includes('"type":"flex"')&&x.text.includes('อนุมัติแล้ว')));
  assert.equal((await db.query('SELECT status FROM member_topup_member_notifications WHERE request_id=$1',[pending.id])).rows[0].status,'SENT');
  assert.equal((await run('review-synthetic',adminA,`topup:v2:review:APPROVED:${pending.id}`)).duplicate,true);
  assert.ok(seen.at(-1)?.text.includes('อนุมัติแล้ว'),'replayed webhook must read the approved row under admin RLS');
  assert.equal((await run('review-stale',adminA,`topup:v2:review:APPROVED:${pending.id}`)).result,'ALREADY_HANDLED');
  for(let i=0;i<5;i++){assert.equal((await run(`review-stale-${i}`,adminA,`topup:v2:review:APPROVED:${pending.id}`)).result,'ALREADY_HANDLED');assert.ok(seen.at(-1)?.text.includes('รายการนี้อนุมัติแล้ว'))}
  assert.equal((await db.query('SELECT demo_points FROM members WHERE id=$1',[chatMember])).rows[0].demo_points,600);
  assert.equal(seen.filter(x=>x.to===memberLine&&x.text.includes('500 แต้ม')).length,1);
  assert.equal((await db.query('SELECT count(*)::int n FROM member_topup_chat_actions WHERE request_id=$1',[pending.id])).rows[0].n,8);
  assert.equal((await db.query("SELECT count(*)::int n FROM member_topup_chat_actions WHERE event_id='denied-synthetic' AND request_id IS NULL AND stage='DENIED'")).rows[0].n,1);
  await assert.rejects(db.query('UPDATE member_topup_chat_actions SET result=$1 WHERE event_id=$2',['fake','review-synthetic']),/topup_immutable/);
  assert.ok(realAdmins.length===2);
  const noLineMember=(await db.query("INSERT INTO members(display_name,demo_points) VALUES('No LINE member',40) RETURNING id")).rows[0].id;
  const noLineRequest=await createTopup(db,noLineMember,15,randomUUID());
  assert.equal((await run('no-line-review',adminA,`topup:v2:review:APPROVED:${noLineRequest.id}`)).result,'APPROVED');
  assert.equal((await db.query('SELECT demo_points FROM members WHERE id=$1',[noLineMember])).rows[0].demo_points,55);
  assert.deepEqual((await db.query('SELECT recipient_user_id,status FROM member_topup_member_notifications WHERE request_id=$1',[noLineRequest.id])).rows[0],{recipient_user_id:null,status:'FAILED'});
  const adminLinkedMember=(await db.query("INSERT INTO members(display_name,demo_points) VALUES('Admin-linked member',10) RETURNING id")).rows[0].id;
  await db.query("INSERT INTO member_identities(member_id,provider,provider_channel_id,provider_user_id) VALUES($1,'line','test',$2)",[adminLinkedMember,adminA]);
  const adminLinkedRequest=await createTopup(db,adminLinkedMember,11,randomUUID());
  assert.equal((await run('admin-linked-review',adminB,`topup:v2:review:APPROVED:${adminLinkedRequest.id}`)).result,'APPROVED');
  assert.deepEqual((await db.query('SELECT recipient_user_id,status FROM member_topup_member_notifications WHERE request_id=$1',[adminLinkedRequest.id])).rows[0],{recipient_user_id:null,status:'FAILED'});
  const rejectRequest=await createTopup(db,chatMember,20,randomUUID());
  assert.equal((await run('reject-review',adminA,`topup:v2:review:REJECTED:${rejectRequest.id}`)).result,'REJECTED');
  assert.equal((await db.query('SELECT count(*)::int n FROM member_topup_member_notifications WHERE request_id=$1',[rejectRequest.id])).rows[0].n,0);
  const retryRequest=await createTopup(db,chatMember,25,randomUUID());
  const approvalEvent={webhookEventId:'retry-review',type:'postback' as const,userId:adminA,data:`topup:v2:review:APPROVED:${retryRequest.id}`};
  const failedDeliveries:string[]=[];
  await assert.rejects(processTopupPostback(db,approvalEvent,{allowlist:allow,fetch:async(_url,init)=>{const payload=JSON.parse(String(init?.body));failedDeliveries.push(JSON.stringify(payload.messages[0]));return new Response('',{status:503})}}),/line_delivery_failed/);
  assert.equal(failedDeliveries.filter(text=>text.includes('ดำเนินการเติมแต้มไม่สำเร็จ')).length,0);
  const replay=await processTopupPostback(db,approvalEvent,{allowlist:allow,fetch:fakeFetch});
  assert.equal(replay.duplicate,true);
  assert.ok(seen.some(x=>x.to===adminA&&x.text.includes('อนุมัติแล้ว')));
  assert.equal((await db.query('SELECT demo_points FROM members WHERE id=$1',[chatMember])).rows[0].demo_points,625);
  assert.equal((await db.query('SELECT status FROM member_topup_member_notifications WHERE request_id=$1',[retryRequest.id])).rows[0].status,'RETRY');
  await db.query('UPDATE member_topup_member_notifications SET next_attempt_at=now()-interval \'1 second\' WHERE request_id=$1',[retryRequest.id]);
  assert.equal((await dispatchApprovedMemberLine(db,{token:'synthetic-token',fetch:fakeFetch})).sent,1);
  assert.equal((await db.query('SELECT status FROM member_topup_member_notifications WHERE request_id=$1',[retryRequest.id])).rows[0].status,'SENT');
  assert.equal((await db.query('SELECT count(*)::int n FROM member_topup_audit WHERE request_id=$1',[retryRequest.id])).rows[0].n,1);
 }finally{for(const [key,value] of Object.entries({LINE_MESSAGING_CHANNEL_ACCESS_TOKEN:prior.token,LINE_LOGIN_CHANNEL_ID:prior.login,LINE_MESSAGING_CHANNEL_ID:prior.messaging,TOPUP_IMAGE_SIGNING_SECRET:prior.secret})){if(value===undefined)delete process.env[key];else process.env[key]=value}}
 // V3 retention: only enrolled, due, unheld slips are deleted. Accounting rows survive.
 const past=new Date(Date.now()-86400000-60000);
 await db.query('UPDATE member_topup_slip_retention SET expires_at=$2 WHERE request_id=$1',[verified.id,past]);
 await db.query('UPDATE member_topup_slip_retention SET expires_at=$2,legal_hold=true,hold_reason=$3 WHERE request_id=$1',[imageRequest.id,past,'synthetic dispute']);
 const failed=await cleanupTopupTemporary(db,async()=>{throw Error('synthetic R2 outage')});assert.equal(failed.retried,1);
 const deleted:string[]=[];const cleaned=await cleanupTopupTemporary(db,async key=>{deleted.push(key)},new Date(Date.now()+120000));assert.equal(cleaned.purged,1);assert.deepEqual(deleted,[slip.objectKey]);
 assert.equal((await db.query('SELECT state FROM member_topup_slip_retention WHERE request_id=$1',[imageRequest.id])).rows[0].state,'ACTIVE');
 assert.equal((await cleanupTopupTemporary(db,async()=>{throw Error('duplicate deletion')})).purged,0);
 assert.equal((await db.query('SELECT count(*)::int n FROM member_topup_requests WHERE id=$1',[verified.id])).rows[0].n,1);
 assert.equal((await db.query('SELECT count(*)::int n FROM member_topup_audit WHERE request_id=$1',[id])).rows[0].n,1);
 const f=historyFilter(new URLSearchParams('period=all&status=APPROVED'));
 const summary=await historySummary(db,f);assert.equal(summary.count,5);
 const csvBytes=new Uint8Array(await Promise.race([new Response(historyCsv(db,f)).arrayBuffer(),new Promise<never>((_,reject)=>setTimeout(()=>reject(Error('csv_stream_timeout')),10000))]));assert.deepEqual([...csvBytes.slice(0,3)],[239,187,191]);
 const exported=new TextDecoder().decode(csvBytes);assert.match(exported,/Synthetic topup member/);assert.doesNotMatch(exported,/topup-slips\//);
 assert.equal((await listTopups(db,other)).length,0);await assert.rejects(decideTopup(db,randomUUID(),rollback.id,'APPROVED',''),/admin_forbidden/);
 await assert.rejects(db.query("UPDATE member_topup_requests SET status='PENDING' WHERE id=$1",[id]),/topup_immutable/);await assert.rejects(db.query('DELETE FROM member_topup_audit'),/topup_immutable/);
 assert.deepEqual((await db.query('SELECT phase,enabled,ever_cutover FROM member_wallet_runtime_state WHERE id=1')).rows[0],{phase:'LEGACY',enabled:false,ever_cutover:false});
 // Verify policies as a non-owner; application queries additionally scope every read.
 const c=await db.connect();const role='topup_reader_'+randomUUID().replaceAll('-','');try{await c.query('BEGIN');await c.query(`CREATE ROLE ${role} NOLOGIN`);await c.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`);await c.query(`GRANT SELECT ON member_topup_requests,member_topup_audit TO ${role}`);await c.query(`SET LOCAL ROLE ${role}`);await c.query("SELECT set_config('pair_live.member_id',$1,true)",[other]);assert.equal((await c.query('SELECT * FROM member_topup_requests')).rowCount,0);assert.equal((await c.query('SELECT * FROM member_topup_audit')).rowCount,0)}finally{await c.query('ROLLBACK');c.release()}
 }finally{for(const k of ['LINE_LOGIN_PROVIDER_ID','LINE_MESSAGING_PROVIDER_ID','LINE_LOGIN_CHANNEL_ID','LINE_MESSAGING_CHANNEL_ID'])delete process.env[k];await db?.end();await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await pool.end()}
});

test('request card approves directly by LINE postback without redirect',async()=>{const {requestCard}=await import('../lib/topup/line-card');const id=randomUUID();const card=requestCard({id,displayName:'Synthetic Member',points:50,status:'รอตรวจสอบ',createdAt:new Date()});const json=JSON.stringify(card);assert.match(json,/ตรวจหลักฐานตามช่องทางที่ได้รับ/);const primary=JSON.parse(json).contents.footer.contents[0].action;assert.equal(primary.type,'postback');assert.equal(primary.data,`topup:v2:review:APPROVED:${id}`);assert.doesNotMatch(json,/admin\/topup-review|displayText|ต้องตรวจภาพสลิป/)});

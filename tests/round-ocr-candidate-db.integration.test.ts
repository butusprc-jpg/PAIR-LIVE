import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {Pool} from 'pg';
import sharp from 'sharp';
import {assertTestTarget,migrationManifest} from '../lib/migration-manifest';
import {lockRoundOcrCandidate} from '../lib/ocr/round-candidate';
import {TesseractOcrAdapter} from '../lib/ocr/engine';
import type {LiveFrameSource} from '../lib/ocr/live-frame-source';

test('two OCR workers lock one candidate after round close without settlement or LINE',{skip:!process.env.OCR_CANDIDATE_TEST_DATABASE_URL},async()=>{
 const raw=process.env.OCR_CANDIDATE_TEST_DATABASE_URL!,root=new Pool({connectionString:assertTestTarget(raw)}),schema='ocr_candidate_'+randomUUID().replaceAll('-','');let db:Pool|undefined,createdPublicBinding=false;
 const keys=['CONNECTED_LINE_OA_ID','LINE_MESSAGING_CHANNEL_ACCESS_TOKEN'],prior=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 try{
  if(!(await root.query("SELECT to_regclass('public.external_live_role_bindings') AS existing")).rows[0].existing){await root.query('CREATE TABLE public.external_live_role_bindings(role_name name,oa_id uuid)');createdPublicBinding=true}
  await root.query(`CREATE SCHEMA ${schema}`);const url=new URL(raw);url.searchParams.set('options',`-csearch_path=${schema}`);db=new Pool({connectionString:url.toString(),max:8});
  for(const migration of await migrationManifest())await db.query(migration.sql);
  const token='synthetic-ocr-test-token',lineOa='@synthetic-ocr';process.env.CONNECTED_LINE_OA_ID=lineOa;process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN=token;
  const oaId=(await db.query("INSERT INTO oa_service_control(line_oa_id,shop_name,enabled,expires_at,verified_token_hash) VALUES($1,'OCR Test',true,now()+interval '1 day',$2) RETURNING id",[lineOa,createHash('sha256').update(token).digest('hex')])).rows[0].id;
  const admin=(await db.query("INSERT INTO admin_identities(provider,provider_channel_id,provider_user_id,display_name,role) VALUES('line','login-test',$1,'Admin','admin') RETURNING id",['U'+'a'.repeat(32)])).rows[0].id;
  const site=(await db.query("INSERT INTO camera_sites(oa_id,name) VALUES($1,'Test Site') RETURNING site_id",[oaId])).rows[0].site_id;
  await db.query("INSERT INTO vdo_ninja_tenants(oa_id,stream_id,display_enabled) VALUES($1,'synthetic123',true)",[oaId]);
  const camera=(await db.query("INSERT INTO site_cameras(site_id,oa_id,slot,name,stream_id,display_enabled) VALUES($1,$2,1,'Test Camera','synthetic123',true) RETURNING camera_id",[site,oaId])).rows[0].camera_id;
  await db.query('INSERT INTO camera_ocr_roi(camera_id,oa_id,x,y,width,height,updated_by) VALUES($1,$2,0,0,8000,10000,$3)',[camera,oaId,admin]);
  const round=(await db.query("INSERT INTO rounds(round_date,opens_at,closes_at,duration_minutes,status,closed_at,settlement_oa_id) VALUES(current_date,now()-interval '10 minutes',now()-interval '5 minutes',5,'SCANNING',now()-interval '5 minutes',$1) RETURNING id",[oaId])).rows[0].id;
  let sequence=0;
  const makeSource=():LiveFrameSource=>({kind:'VDO_NINJA',async open(){},async capture(){await delay(450);const n=++sequence;const image=await sharp(Buffer.from(`<svg width="800" height="240" xmlns="http://www.w3.org/2000/svg"><rect width="800" height="240" fill="white"/><text x="320" y="170" text-anchor="middle" font-family="DejaVu Sans" font-size="120" fill="black">5.60</text><rect x="700" y="${n%100}" width="20" height="20" fill="black"/></svg>`)).png().toBuffer();return {id:`server-${n}`,roundId:'0',source:'MOBILE_CAMERA',capturedAt:new Date().toISOString(),image,width:800,height:240,healthy:true,sourceFrameIndex:n}},async close(){}});
  const factory=()=>makeSource(),engine=new TesseractOcrAdapter();
  const [first,second]=await Promise.all([lockRoundOcrCandidate(db,String(round),{VDO_NINJA:factory},engine),lockRoundOcrCandidate(db,String(round),{VDO_NINJA:factory},engine)]);
  assert.equal(first.status,'LOCKED');assert.equal(second.status,'LOCKED');
  if(first.status==='LOCKED'&&second.status==='LOCKED')assert.deepEqual([first.replayed,second.replayed].sort(),[false,true]);
  assert.equal((await db.query('SELECT count(*)::int n FROM round_ocr_candidate_locks WHERE round_id=$1',[round])).rows[0].n,1);
  assert.equal((await db.query('SELECT count(*)::int n FROM round_settlement_awards')).rows[0].n,0);
  assert.equal((await db.query('SELECT count(*)::int n FROM round_result_line_outbox')).rows[0].n,0);
 }finally{for(const key of keys){if(prior[key]===undefined)delete process.env[key];else process.env[key]=prior[key]}await db?.end();await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);if(createdPublicBinding)await root.query('DROP TABLE public.external_live_role_bindings');await root.end()}
});

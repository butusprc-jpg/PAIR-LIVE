import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {assertTestTarget,migrationManifest} from '../../../lib/migration-manifest';
import {cameraLayout,configureCamera,primaryCameraAction,provisionCameraSite,readCameraSite,renameCameraSite} from '../server/cameras';
const raw=process.env.VDO_TEST_DATABASE_URL;
test('V15 four cameras retain stable IDs, isolate OA, enforce RLS, and reject slot 5',{skip:!raw},async()=>{
 const root=new Pool({connectionString:assertTestTarget(raw),ssl:false});const schema='camera_v15_'+randomUUID().replaceAll('-','');let db:Pool|undefined;
 try{
  await root.query(`CREATE SCHEMA ${schema}`);const url=new URL(raw!);url.searchParams.set('options',`-csearch_path=${schema}`);db=new Pool({connectionString:url.toString(),ssl:false});
  for(const migration of await migrationManifest())await db.query(migration.sql);
  const ids:string[]=[];for(const [i,channel] of ['camera-channel-A','camera-channel-B'].entries()){
   const id=(await db.query("INSERT INTO oa_service_control(line_oa_id,shop_name,enabled,expires_at,verified_token_hash) VALUES($1,$2,true,now()+interval '1 day',repeat('a',64)) RETURNING id",[`@cam-${i}`,`Shop ${i}`])).rows[0].id;ids.push(id);
   await db.query('INSERT INTO vdo_ninja_channel_bindings(provider_channel_id,oa_id) VALUES($1,$2)',[channel,id]);
  }
  const first=await provisionCameraSite(db,'camera-channel-A'),other=await provisionCameraSite(db,'camera-channel-B');assert.equal(first.cameras.length,4);assert.equal(other.cameras.length,4);assert.equal((await readCameraSite(db,'camera-channel-A')).cameras.length,0);
  const idsBefore=first.cameras.map(c=>c.cameraId);const site=await renameCameraSite(db,'camera-channel-A','admin-a','กล้องร้าน A','Thailand');assert.equal(site.site?.name,'กล้องร้าน A');assert.equal(site.site?.siteId,first.site?.siteId);
  const camera=first.cameras[1];const named=await configureCamera(db,'camera-channel-A','admin-a',{cameraId:camera.cameraId,revision:camera.revision,name:'กล้องโต๊ะ 2',sourceKind:'VDO_NINJA',streamId:'synthetic_camera_2',action:'save'});assert.equal(named.cameras[1].name,'กล้องโต๊ะ 2');assert.deepEqual(named.cameras.map(c=>c.cameraId),idsBefore);
  await assert.rejects(configureCamera(db,'camera-channel-B','admin-b',{cameraId:camera.cameraId,revision:named.cameras[1].revision,name:'wrong',action:'start'}),/camera_not_found/);
  const started=await configureCamera(db,'camera-channel-A','admin-a',{cameraId:camera.cameraId,revision:named.cameras[1].revision,name:'กล้องโต๊ะ 2',action:'start'});assert.equal((await readCameraSite(db,'camera-channel-A')).cameras.length,1);assert.equal((await readCameraSite(db,'camera-channel-B')).cameras.length,0);assert.equal(cameraLayout(started.cameras.filter(c=>c.displayEnabled).length),'single');
  await assert.rejects(configureCamera(db,'camera-channel-A','admin-a',{cameraId:camera.cameraId,revision:named.cameras[1].revision,name:'again',action:'start'}),/camera_conflict/);
  for(const item of started.cameras.slice(2)){const configured=await configureCamera(db,'camera-channel-A','admin-a',{cameraId:item.cameraId,revision:item.revision,name:item.name,sourceKind:'VDO_NINJA',streamId:`synthetic_camera_${item.slot}`,action:'save'});await configureCamera(db,'camera-channel-A','admin-a',{cameraId:item.cameraId,revision:configured.cameras[item.slot-1].revision,name:item.name,action:'start'})}
  assert.equal((await readCameraSite(db,'camera-channel-A')).layout,'featured');
  // Slot 1 follows the legacy row's live state even when its URL changes independently.
  await db.query('UPDATE vdo_ninja_tenants SET stream_id=$2,display_enabled=true WHERE oa_id=$1',[ids[0],'synthetic_camera_1']);
  assert.equal((await readCameraSite(db,'camera-channel-A')).layout,'quad');
  const primary=first.cameras[0];
  await assert.rejects(primaryCameraAction(db,'camera-channel-B','admin-b',{cameraId:primary.cameraId,revision:primary.revision,action:'stop'}),/camera_not_found/);
  const stopped=await primaryCameraAction(db,'camera-channel-A','admin-a',{cameraId:primary.cameraId,revision:primary.revision,action:'stop'});
  assert.equal(stopped.cameras[0].displayEnabled,false);
  const saved=await primaryCameraAction(db,'camera-channel-A','admin-a',{cameraId:primary.cameraId,revision:stopped.cameras[0].revision,action:'save',url:'https://vdo.ninja/?view=new_main_123'});
  assert.equal(saved.cameras[0].viewerUrl,'https://vdo.ninja/?view=new_main_123');
  assert.equal((await readCameraSite(db,'camera-channel-A')).cameras.some(c=>c.slot===1),false);
  await assert.rejects(primaryCameraAction(db,'camera-channel-A','admin-a',{cameraId:primary.cameraId,revision:saved.cameras[0].revision,action:'save',url:'https://evil.example/?view=new_main_123'}),/invalid_viewer_url/);
  assert.equal((await db.query('SELECT stream_id FROM vdo_ninja_tenants WHERE oa_id=$1',[ids[0]])).rows[0].stream_id,'new_main_123');
  const live=await primaryCameraAction(db,'camera-channel-A','admin-a',{cameraId:primary.cameraId,revision:saved.cameras[0].revision,action:'start'});
  assert.equal(live.cameras[0].displayEnabled,true);
  assert.equal((await readCameraSite(db,'camera-channel-A')).cameras.find(c=>c.slot===1)?.viewerUrl,'https://vdo.ninja/?view=new_main_123');
  await assert.rejects(primaryCameraAction(db,'camera-channel-A','admin-a',{cameraId:primary.cameraId,revision:saved.cameras[0].revision,action:'start'}),/camera_conflict/);
  const hidden=await primaryCameraAction(db,'camera-channel-A','admin-a',{cameraId:primary.cameraId,revision:live.cameras[0].revision,action:'stop'});
  assert.equal(hidden.cameras[0].displayEnabled,false);
  assert.equal((await db.query('SELECT count(*)::int AS count FROM vdo_ninja_audit WHERE oa_id=$1',[ids[0]])).rows[0].count,4);
  assert.equal((await db.query('SELECT stream_id FROM vdo_ninja_tenants WHERE oa_id=$1',[ids[0]])).rows[0].stream_id,'new_main_123');
  await assert.rejects(db.query('INSERT INTO site_cameras(site_id,oa_id,slot,name) VALUES($1,$2,5,$3)',[first.site?.siteId,ids[0],'fifth']),/site_cameras_slot_check/);
  await assert.rejects(db.query('UPDATE site_cameras SET camera_id=$2 WHERE camera_id=$1',[camera.cameraId,randomUUID()]),/camera_identity_immutable/);
  const role='camera_reader_'+randomUUID().replaceAll('-','').slice(0,16),password='ci_'+randomUUID().replaceAll('-','');await db.query(`CREATE ROLE ${role} LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '${password}'`);
  try{await db.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`);await db.query(`GRANT SELECT ON camera_sites,site_cameras TO ${role}`);await db.query('INSERT INTO external_live_role_bindings(role_name,oa_id) VALUES($1,$2)',[role,ids[0]]);const scoped=new URL(url);scoped.username=role;scoped.password=password;const reader=new Pool({connectionString:scoped.toString(),ssl:false});try{assert.equal((await reader.query('SELECT * FROM site_cameras WHERE oa_id=$1',[ids[0]])).rowCount,4);assert.equal((await reader.query('SELECT * FROM site_cameras WHERE oa_id=$1',[ids[1]])).rowCount,0)}finally{await reader.end()}}finally{await db.query('DELETE FROM external_live_role_bindings WHERE role_name=$1',[role]);await db.query(`DROP OWNED BY ${role}`);await db.query(`DROP ROLE ${role}`)}
 }finally{await db?.end();await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await root.end()}
});

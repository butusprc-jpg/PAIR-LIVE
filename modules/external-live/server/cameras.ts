import type {Pool,PoolClient} from 'pg';
import {randomBytes} from 'node:crypto';
import {LiveError} from '../types';
import {resolveVdoTenant,viewerUrl} from './vdo-ninja';

type Site={site_id:string;oa_id:string;name:string;country:string};
type Camera={camera_id:string;site_id:string;oa_id:string;slot:number;name:string;source_kind:'VDO_NINJA'|'RTSP_GATEWAY'|'IP_CAMERA';stream_id:string|null;display_enabled:boolean;revision:string};
export function cameraLayout(count:number){if(!Number.isInteger(count)||count<0||count>4)throw new LiveError('camera_limit_exceeded');return count===0?'empty':count===1?'single':count===2?'double':count===3?'featured':'quad'}
export function cameraName(value:unknown){if(typeof value!=='string'||!value.trim()||value.trim().length>80||/[<>\u0000-\u001f\u007f]/u.test(value))throw new LiveError('invalid_camera_name');return value.trim()}
function publicCamera(row:Camera,visible:boolean){return {cameraId:row.camera_id,siteId:row.site_id,slot:row.slot,name:row.name,sourceKind:row.source_kind,status:row.source_kind==='VDO_NINJA'&&row.stream_id?'READY':'NOT_CONFIGURED',displayEnabled:visible,viewerUrl:visible&&row.stream_id?viewerUrl(row.stream_id):null,revision:Number(row.revision)}}
export async function readCameraSite(db:Pool,channel:string,admin=false){
 const tenant=await resolveVdoTenant(db,channel);
 const site=(await db.query<Site>('SELECT site_id,oa_id,name,country FROM camera_sites WHERE oa_id=$1',[tenant.id])).rows[0];
 const cameras=site?(await db.query<Camera>('SELECT * FROM site_cameras WHERE site_id=$1 ORDER BY slot',[site.site_id])).rows:[];
 const legacy=(await db.query<{stream_id:string;display_enabled:boolean}>('SELECT stream_id,display_enabled FROM vdo_ninja_tenants WHERE oa_id=$1',[tenant.id])).rows[0];
 const list=cameras.map(row=>{
  const enabled=tenant.active&&row.source_kind==='VDO_NINJA'&&!!row.stream_id&&(row.slot===1?!!legacy?.display_enabled:row.display_enabled);
  return {...publicCamera(row,!!enabled),viewerUrl:enabled?viewerUrl(row.slot===1?legacy!.stream_id:row.stream_id!):null};
 });
 const visible=list.filter(x=>x.displayEnabled);
 return {site:site?{siteId:site.site_id,name:site.name,country:site.country}:null,cameras:admin?list.map(x=>({...x,publisherUrl:x.slot!==1&&x.sourceKind==='VDO_NINJA'&&cameras.find(c=>c.camera_id===x.cameraId)?.stream_id?`https://vdo.ninja/?push=${encodeURIComponent(cameras.find(c=>c.camera_id===x.cameraId)!.stream_id!)}`:null})):visible,layout:cameraLayout(visible.length)};
}
export async function provisionCameraSite(db:Pool,channel:string){
 const tenant=await resolveVdoTenant(db,channel);const client=await db.connect();
 try{await client.query('BEGIN');
  await client.query('INSERT INTO camera_sites(oa_id,name) VALUES($1,$2) ON CONFLICT(oa_id) DO NOTHING',[tenant.id,tenant.shop_name]);
  const site=(await client.query<Site>('SELECT site_id,oa_id,name,country FROM camera_sites WHERE oa_id=$1',[tenant.id])).rows[0];
  const legacy=(await client.query<{stream_id:string}>('SELECT stream_id FROM vdo_ninja_tenants WHERE oa_id=$1',[tenant.id])).rows[0];
  for(let slot=1;slot<=4;slot++)await client.query(`INSERT INTO site_cameras(site_id,oa_id,slot,name,stream_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT(oa_id,slot) DO NOTHING`,[site.site_id,tenant.id,slot,slot===1?'กล้องหลัก':`กล้อง ${slot}`,slot===1?legacy?.stream_id||null:null]);
  await client.query('COMMIT');
 }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
 return readCameraSite(db,channel,true);
}
async function change(db:Pool,channel:string,actor:string,fn:(client:PoolClient,site:Site,tenant:Awaited<ReturnType<typeof resolveVdoTenant>>)=>Promise<void>){
 const tenant=await resolveVdoTenant(db,channel);if(!tenant.active)throw new LiveError('oa_service_inactive',403);
 const client=await db.connect();try{await client.query('BEGIN');const site=(await client.query<Site>('SELECT * FROM camera_sites WHERE oa_id=$1 FOR UPDATE',[tenant.id])).rows[0];if(!site)throw new LiveError('camera_site_missing',409);await fn(client,site,tenant);await client.query('COMMIT')}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
 return readCameraSite(db,channel,true);
}
export async function renameCameraSite(db:Pool,channel:string,actor:string,name:unknown,country:unknown){const validName=cameraName(name),validCountry=cameraName(country);return change(db,channel,actor,async(client,site)=>{await client.query('UPDATE camera_sites SET name=$2,country=$3,updated_at=now(),updated_by=$4 WHERE site_id=$1',[site.site_id,validName,validCountry,actor])})}
export async function configureCamera(db:Pool,channel:string,actor:string,input:{cameraId:unknown;revision:unknown;name:unknown;sourceKind?:unknown;streamId?:unknown;action?:unknown}){
 const name=cameraName(input.name);
 if(typeof input.cameraId!=='string'||!Number.isSafeInteger(input.revision)||Number(input.revision)<0)throw new LiveError('invalid_camera');
 if(!['save','connect','start','stop','test'].includes(String(input.action)))throw new LiveError('invalid_camera_action');
 return change(db,channel,actor,async(client,site,tenant)=>{
  const row=(await client.query<Camera>('SELECT * FROM site_cameras WHERE camera_id=$1 AND oa_id=$2 AND site_id=$3 FOR UPDATE',[input.cameraId,tenant.id,site.site_id])).rows[0];
  if(!row)throw new LiveError('camera_not_found',404);
  if(Number(row.revision)!==input.revision)throw new LiveError('camera_conflict',409);
  if(row.slot===1&&input.action!=='save'&&input.action!=='test')throw new LiveError('legacy_camera_control_required',409);
  let kind=row.source_kind,stream=row.stream_id;
  if(input.action==='save'){
   kind=String(input.sourceKind||row.source_kind) as Camera['source_kind'];
   if(!['VDO_NINJA','RTSP_GATEWAY','IP_CAMERA'].includes(kind))throw new LiveError('invalid_camera_source');
   if(row.slot===1&&kind!=='VDO_NINJA')throw new LiveError('legacy_camera_control_required',409);
   if(kind!=='VDO_NINJA')stream=null;
   else if(row.slot!==1){stream=input.streamId===null||input.streamId===''?null:String(input.streamId??row.stream_id??'');if(stream&&!/^[A-Za-z0-9_-]{7,64}$/.test(stream))throw new LiveError('invalid_stream_id')}
   if(row.display_enabled&&(kind!=='VDO_NINJA'||!stream))throw new LiveError('camera_must_stop_first',409);
  }
  if(input.action==='connect'){
   if(row.slot===1||kind!=='VDO_NINJA')throw new LiveError('camera_not_configured',409);
   stream=stream||randomBytes(18).toString('base64url');
  }
  if(input.action==='start'&&(kind!=='VDO_NINJA'||!stream))throw new LiveError('camera_not_configured',409);
  if(input.action==='test'&&kind!=='VDO_NINJA')throw new LiveError('gateway_not_configured',409);
  if(input.action==='test')return;
  await client.query(`UPDATE site_cameras SET name=$4,source_kind=$5,stream_id=$6,display_enabled=$7,revision=revision+1,updated_at=now(),updated_by=$8 WHERE camera_id=$1 AND oa_id=$2 AND site_id=$3`,[row.camera_id,tenant.id,site.site_id,name,kind,stream,row.slot===1?row.display_enabled:input.action==='start'?true:input.action==='stop'?false:row.display_enabled,actor]);
 });
}

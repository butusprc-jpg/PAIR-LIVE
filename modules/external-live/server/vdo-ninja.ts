import {createHash,randomBytes} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {LiveError} from '../types';
import {decryptControlKey,encryptControlKey,newControlKey,readPublisher,remotePublisherUrl,setCamera,type RemoteTransport} from './remote-control';

type Tenant={id:string;line_oa_id:string;shop_name:string;enabled:boolean;paused:boolean;deleted_at:Date|null;expires_at:Date;verified_token_hash:string|null};
type Row={oa_id:string;stream_id:string;display_enabled:boolean;revision:string|number;updated_at:Date;updated_by:string|null;remote_key_ciphertext:string|null};
const columns='oa_id,stream_id,display_enabled,revision,updated_at,updated_by,remote_key_ciphertext';
export function viewerUrl(id:string){return `https://vdo.ninja/?view=${encodeURIComponent(id)}`}
export function publisherUrl(id:string,key:string){return remotePublisherUrl(id,key)}
export async function resolveVdoTenant(db:Pool,channelId:string|undefined){if(!channelId)throw new LiveError('tenant_binding_missing',403);let tenant:Tenant|undefined;if(channelId===process.env.LINE_LOGIN_CHANNEL_ID&&process.env.CONNECTED_LINE_OA_ID){tenant=(await db.query<Tenant>(`SELECT id,line_oa_id,shop_name,enabled,paused,deleted_at,expires_at,verified_token_hash FROM oa_service_control WHERE line_oa_id=$1`,[process.env.CONNECTED_LINE_OA_ID])).rows[0]}else{tenant=(await db.query<Tenant>(`SELECT o.id,o.line_oa_id,o.shop_name,o.enabled,o.paused,o.deleted_at,o.expires_at,o.verified_token_hash FROM vdo_ninja_channel_bindings b JOIN oa_service_control o ON o.id=b.oa_id WHERE b.provider_channel_id=$1`,[channelId])).rows[0]}if(!tenant)throw new LiveError('tenant_binding_missing',403);const verified=!!tenant.verified_token_hash&&(channelId!==process.env.LINE_LOGIN_CHANNEL_ID||tenant.line_oa_id!==process.env.CONNECTED_LINE_OA_ID||!!process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN&&tenant.verified_token_hash===createHash('sha256').update(process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN).digest('hex'));if(!verified)throw new LiveError('oa_binding_unverified',403);return {...tenant,active:tenant.enabled&&!tenant.paused&&!tenant.deleted_at&&new Date(tenant.expires_at).getTime()>Date.now()}}
function memberState(row:Row|null,tenant:Awaited<ReturnType<typeof resolveVdoTenant>>){const visible=!!(tenant.active&&row?.display_enabled);return {oaName:tenant.shop_name,displayEnabled:visible,status:visible?'CONNECTING':'OFFLINE',viewerUrl:visible&&row?viewerUrl(row.stream_id):null,revision:Number(row?.revision||0)}}
async function adminState(row:Row|null,tenant:Awaited<ReturnType<typeof resolveVdoTenant>>,transport?:RemoteTransport,remoteWarning?:string){const visible=!!(tenant.active&&row?.display_enabled);if(!row?.remote_key_ciphertext)return {...memberState(row,tenant),viewerUrl:row?viewerUrl(row.stream_id):null,publisherUrl:null,cameraStatus:'NOT_CONNECTED',remoteWarning:remoteWarning||null};const key=decryptControlKey(row.remote_key_ciphertext);let cameraStatus='UNAVAILABLE';try{const camera=await readPublisher(key,row.stream_id,transport);cameraStatus=camera.cameraMuted?'READY':'SENDING_UNVERIFIED'}catch(error){if(error instanceof LiveError&&error.code==='publisher_not_connected')cameraStatus='NOT_CONNECTED'}return {...memberState(row,tenant),displayEnabled:visible,viewerUrl:viewerUrl(row.stream_id),publisherUrl:publisherUrl(row.stream_id,key),cameraStatus,remoteWarning:remoteWarning||null}}
function auditState(row:Row){const {remote_key_ciphertext:_secret,...safe}=row;return safe}
async function audit(client:PoolClient,tenantId:string,actor:string,action:'CONNECT'|'START'|'STOP',previous:Row,updated:Row){await client.query('INSERT INTO vdo_ninja_audit(oa_id,revision,actor,action,before_state,after_state) VALUES($1,$2,$3,$4,$5,$6)',[tenantId,updated.revision,actor,action,JSON.stringify(auditState(previous)),JSON.stringify(auditState(updated))])}
export async function memberVdoLive(db:Pool,channelId:string){const tenant=await resolveVdoTenant(db,channelId);const row=(await db.query<Row>(`SELECT ${columns} FROM vdo_ninja_tenants WHERE oa_id=$1`,[tenant.id])).rows[0]||null;return memberState(row,tenant)}
export async function adminVdoLive(db:Pool,channelId:string,provision=true,transport?:RemoteTransport){const tenant=await resolveVdoTenant(db,channelId);if(!provision){const row=(await db.query<Row>(`SELECT ${columns} FROM vdo_ninja_tenants WHERE oa_id=$1`,[tenant.id])).rows[0]||null;if(!row)throw new LiveError('live_configuration_missing',503);return adminState(row,tenant,transport)}const client=await db.connect();let row:Row;try{await client.query('BEGIN');await client.query(`INSERT INTO vdo_ninja_tenants(oa_id,stream_id) VALUES($1,$2) ON CONFLICT(oa_id) DO NOTHING`,[tenant.id,randomBytes(18).toString('base64url')]);row=(await client.query<Row>(`SELECT ${columns} FROM vdo_ninja_tenants WHERE oa_id=$1`,[tenant.id])).rows[0];await client.query('COMMIT')}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}return adminState(row,tenant,transport)}
export async function changeVdoLive(db:Pool,channelId:string,action:'connect'|'start'|'stop',revision:number,actor:string,transport?:RemoteTransport){if(!Number.isSafeInteger(revision)||revision<0)throw new LiveError('invalid_revision');const tenant=await resolveVdoTenant(db,channelId);if(action!=='stop'&&!tenant.active)throw new LiveError('oa_service_inactive',403);const client:PoolClient=await db.connect();let updated:Row;let warning:string|undefined;try{await client.query('BEGIN');const previous=(await client.query<Row>(`SELECT ${columns} FROM vdo_ninja_tenants WHERE oa_id=$1 FOR UPDATE`,[tenant.id])).rows[0];if(!previous)throw new LiveError('live_configuration_missing',409);if(Number(previous.revision)!==revision)throw new LiveError('live_conflict',409);if(action==='connect'){if(previous.remote_key_ciphertext){updated=previous}else{updated=(await client.query<Row>(`UPDATE vdo_ninja_tenants SET remote_key_ciphertext=$2,revision=revision+1,updated_at=now(),updated_by=$3 WHERE oa_id=$1 RETURNING ${columns}`,[tenant.id,encryptControlKey(newControlKey()),actor])).rows[0];await audit(client,tenant.id,actor,'CONNECT',previous,updated)}}else if(action==='start'){if(!previous.remote_key_ciphertext)throw new LiveError('publisher_not_connected',409);const key=decryptControlKey(previous.remote_key_ciphertext);await setCamera(key,true,transport);const details=await readPublisher(key,previous.stream_id,transport);if(details.cameraMuted)throw new LiveError('remote_command_unconfirmed',503);if(previous.display_enabled){updated=previous}else{updated=(await client.query<Row>(`UPDATE vdo_ninja_tenants SET display_enabled=true,revision=revision+1,updated_at=now(),updated_by=$2 WHERE oa_id=$1 RETURNING ${columns}`,[tenant.id,actor])).rows[0];await audit(client,tenant.id,actor,'START',previous,updated)}}else{if(previous.remote_key_ciphertext){try{await setCamera(decryptControlKey(previous.remote_key_ciphertext),false,transport)}catch{warning='publisher_stop_unconfirmed'}}else warning='publisher_not_connected';if(previous.display_enabled){updated=(await client.query<Row>(`UPDATE vdo_ninja_tenants SET display_enabled=false,revision=revision+1,updated_at=now(),updated_by=$2 WHERE oa_id=$1 RETURNING ${columns}`,[tenant.id,actor])).rows[0];await audit(client,tenant.id,actor,'STOP',previous,updated)}else updated=previous}await client.query('COMMIT')}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}return adminState(updated,tenant,transport,warning)}


/**
 * Staging-only first-use setup for the single camera OA. Called exclusively after
 * the existing LINE admin session is validated, never from member routes.
 * Do not create/replace an OA when the owner has configured any OA already.
 * Production and multi-OA projects retain the owner provisioning process.
 */
export async function ensureStagingPrimaryCameraOa(db:Pick<Pool,'query'>,channelId:string){
 if(process.env.RAILWAY_ENVIRONMENT_NAME!=='staging'||
    process.env.RAILWAY_SINGLE_OA_MODE!=='true'||
    !channelId||channelId!==process.env.LINE_LOGIN_CHANNEL_ID)return;
 const oaId=process.env.CONNECTED_LINE_OA_ID;
 const token=process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN;
 if(!oaId||!token)throw new LiveError('oa_configuration_missing',503);
 // An unrelated historical OA record must not prevent staging's configured
 // OA from being created. Never overwrite, renew or re-enable owner records.
 const existing=await db.query('SELECT id FROM oa_service_control WHERE line_oa_id=$1',[oaId]);
 if(existing.rows.length)return;
 const hash=createHash('sha256').update(token).digest('hex');
 await db.query(
  `INSERT INTO oa_service_control(line_oa_id,shop_name,enabled,verified_token_hash,expires_at)
   SELECT $1,'PAIR LIVE',true,$2,now()+interval '30 days'
   WHERE NOT EXISTS (SELECT 1 FROM oa_service_control WHERE enabled=true AND deleted_at IS NULL AND line_oa_id<>$1)
   ON CONFLICT (line_oa_id) DO NOTHING`,
  [oaId,hash]
 );
}

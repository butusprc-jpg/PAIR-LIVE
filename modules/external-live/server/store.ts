import type {Pool,PoolClient} from 'pg';
import {LiveError,type LiveMode,type LiveState} from '../types';
import {phase} from './scheduling';
import {embedUrl,parseYouTubeId} from './youtube-url';
type Row={oa_id:string;video_id:string|null;status:'OFFLINE'|'READY'|'SHOWING'|'INTERMISSION';mode:LiveMode;show_seconds:number;break_seconds:number;started_at:Date|null;revision:string;updated_at:Date};
async function scoped<T>(pool:Pool,oaId:string,fn:(client:PoolClient)=>Promise<T>){
 const client=await pool.connect();try{await client.query('BEGIN');await client.query("SELECT set_config('pair_live.external_live_oa',$1,true)",[oaId]);const value=await fn(client);await client.query('COMMIT');return value}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
}
function view(row:Row|null,now:Date,active:boolean):LiveState{
 const current=row?phase(row.status,row.mode,row.started_at,row.show_seconds,row.break_seconds,now):{status:'OFFLINE' as const,phaseEndsAt:null};
 const status=active?current.status:'OFFLINE';return {status,mode:row?.mode||'MANUAL',videoId:row?.video_id||null,embedUrl:active&&status==='SHOWING'&&row?.video_id?embedUrl(row.video_id):null,showSeconds:row?.show_seconds||90,breakSeconds:row?.break_seconds||30,startedAt:row?.started_at?.toISOString()||null,phaseEndsAt:active?current.phaseEndsAt?.toISOString()||null:null,serverNow:now.toISOString(),revision:Number(row?.revision||0)};
}
async function time(client:PoolClient){return new Date((await client.query<{now:Date}>('SELECT clock_timestamp() AS now')).rows[0].now)}
async function audit(client:PoolClient,oaId:string,row:Row,actor:string,action:string,before:LiveState){await client.query('INSERT INTO external_live_tenant_audit(oa_id,revision,actor,action,before_state,after_state) VALUES($1,$2,$3,$4,$5,$6)',[oaId,row.revision,actor,action,JSON.stringify(before),JSON.stringify(row)])}
export async function readLive(pool:Pool,oaId:string,active:boolean,controlUpdatedAt?:Date){return scoped(pool,oaId,async client=>{
  const now=await time(client);
  // An inactive OA permanently stops a previously running cycle. Resume requires an admin start.
  if(!active||controlUpdatedAt){const prior=(await client.query<Row>('SELECT * FROM external_live_tenants WHERE oa_id=$1 FOR UPDATE',[oaId])).rows[0];if(prior&&prior.status!=='OFFLINE'&&(!active||prior.started_at&&controlUpdatedAt&&controlUpdatedAt>prior.started_at)){
    const before=view(prior,now,true);const row=(await client.query<Row>("UPDATE external_live_tenants SET status='OFFLINE',started_at=NULL,revision=revision+1,updated_at=clock_timestamp() WHERE oa_id=$1 RETURNING *",[oaId])).rows[0];await audit(client,oaId,row,'system','OA_INACTIVE',before);
  }}
  const row=(await client.query<Row>('SELECT * FROM external_live_tenants WHERE oa_id=$1',[oaId])).rows[0]||null;return view(row,now,active);
 });}
export type Change={action:'save'|'settings'|'start'|'stop';url?:unknown;mode?:unknown;showSeconds?:unknown;breakSeconds?:unknown;revision?:unknown};
export async function changeLive(pool:Pool,oaId:string,active:boolean,actor:string,change:Change){
 if(!Number.isSafeInteger(change.revision)||Number(change.revision)<0)throw new LiveError('invalid_revision');
 const video=change.action==='save'?parseYouTubeId(change.url):null;
 if(change.action==='settings'&&(!['MANUAL','AUTO'].includes(String(change.mode))||!Number.isInteger(change.showSeconds)||Number(change.showSeconds)<10||Number(change.showSeconds)>3600||!Number.isInteger(change.breakSeconds)||Number(change.breakSeconds)<1||Number(change.breakSeconds)>3600))throw new LiveError('invalid_live_settings');
 return scoped(pool,oaId,async client=>{
  const now=await time(client);
  await client.query('INSERT INTO external_live_tenants(oa_id) VALUES($1) ON CONFLICT DO NOTHING',[oaId]);
  const row=(await client.query<Row>('SELECT * FROM external_live_tenants WHERE oa_id=$1 FOR UPDATE',[oaId])).rows[0];
  if(Number(row.revision)!==change.revision)throw new LiveError('stale_live_revision',409);
  if(!active&&change.action!=='stop')throw new LiveError('oa_service_inactive',403);
  const current=phase(row.status,row.mode,row.started_at,row.show_seconds,row.break_seconds,now).status;
  if(change.action==='start'&&(!row.video_id||current==='SHOWING'||current==='INTERMISSION'))throw new LiveError('live_start_unavailable',409);
  if(change.action==='stop'&&row.status==='OFFLINE')throw new LiveError('live_already_stopped',409);
  const before=view(row,now,active);let changed:Row;
  if(change.action==='save')changed=(await client.query<Row>("UPDATE external_live_tenants SET video_id=$2,status='READY',started_at=NULL,revision=revision+1,updated_at=clock_timestamp() WHERE oa_id=$1 RETURNING *",[oaId,video])).rows[0];
  else if(change.action==='settings')changed=(await client.query<Row>("UPDATE external_live_tenants SET mode=$2,show_seconds=$3,break_seconds=$4,status=CASE WHEN status='OFFLINE' THEN 'OFFLINE' ELSE 'READY' END,started_at=NULL,revision=revision+1,updated_at=clock_timestamp() WHERE oa_id=$1 RETURNING *",[oaId,change.mode,change.showSeconds,change.breakSeconds])).rows[0];
  else if(change.action==='start')changed=(await client.query<Row>("UPDATE external_live_tenants SET status='SHOWING',started_at=clock_timestamp(),revision=revision+1,updated_at=clock_timestamp() WHERE oa_id=$1 RETURNING *",[oaId])).rows[0];
  else changed=(await client.query<Row>("UPDATE external_live_tenants SET status='OFFLINE',started_at=NULL,revision=revision+1,updated_at=clock_timestamp() WHERE oa_id=$1 RETURNING *",[oaId])).rows[0];
  await audit(client,oaId,changed,actor,change.action.toUpperCase(),before);return view(changed,await time(client),active);
 });
}

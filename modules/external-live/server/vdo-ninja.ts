import type {Pool,PoolClient} from 'pg';
import {LiveError} from '../types';

export function streamId(){const id=process.env.VDO_NINJA_STREAM_ID||'UzsGTCK';if(!/^[A-Za-z0-9_-]{4,64}$/.test(id))throw new LiveError('invalid_stream_configuration',503);return id}
export function viewerUrl(){return `https://vdo.ninja/?view=${encodeURIComponent(streamId())}`}
export function publisherUrl(){return `https://vdo.ninja/?push=${encodeURIComponent(streamId())}`}
type Row={vdo_display_enabled:boolean;vdo_revision:string|number};
const select='SELECT vdo_display_enabled, vdo_revision FROM external_live_settings WHERE id=1';
function state(row:Row){return {displayEnabled:row.vdo_display_enabled,status:row.vdo_display_enabled?'CONNECTING':'OFFLINE',viewerUrl:viewerUrl(),revision:Number(row.vdo_revision)}}
export async function memberVdoLive(db:Pool){const result=await db.query<Row>(select);if(result.rowCount!==1)throw new LiveError('live_configuration_missing',503);const current=state(result.rows[0]);return {displayEnabled:current.displayEnabled,status:current.status,viewerUrl:current.displayEnabled?current.viewerUrl:null,revision:current.revision}}
export async function adminVdoLive(db:Pool){const result=await db.query<Row>(select);if(result.rowCount!==1)throw new LiveError('live_configuration_missing',503);return {...state(result.rows[0]),publisherUrl:publisherUrl()}}
export async function changeVdoLive(db:Pool,action:'start'|'stop',revision:number,adminId:string){if(!Number.isSafeInteger(revision)||revision<0)throw new LiveError('invalid_revision');const client:PoolClient=await db.connect();try{await client.query('BEGIN');const result=await client.query<Row>(`${select} FOR UPDATE`);if(result.rowCount!==1)throw new LiveError('live_configuration_missing',503);const previous=result.rows[0];if(Number(previous.vdo_revision)!==revision)throw new LiveError('live_conflict',409);const enabled=action==='start';if(previous.vdo_display_enabled!==enabled){await client.query('UPDATE external_live_settings SET vdo_display_enabled=$1, vdo_revision=vdo_revision+1, updated_at=now(), updated_by=$2 WHERE id=1',[enabled,adminId])}const updated=await client.query<Row>(select);await client.query('COMMIT');return {...state(updated.rows[0]),publisherUrl:publisherUrl()}}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}}

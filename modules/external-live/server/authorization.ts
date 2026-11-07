import type {Pool} from 'pg';
import {createHash} from 'node:crypto';
import {LiveError} from '../types';
export async function connectedOa(pool:Pool,channelId:string|undefined){
 if(!channelId||channelId!==process.env.LINE_LOGIN_CHANNEL_ID||!process.env.CONNECTED_LINE_OA_ID||!process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN)throw new LiveError('oa_binding_unverified',403);
 const result=await pool.query<{id:string;enabled:boolean;paused:boolean;deleted_at:Date|null;expires_at:Date;updated_at:Date;verified_token_hash:string|null}>(
  'SELECT id,enabled,paused,deleted_at,expires_at,updated_at,verified_token_hash FROM oa_service_control WHERE line_oa_id=$1',[process.env.CONNECTED_LINE_OA_ID]);
 const row=result.rows[0];if(!row||row.verified_token_hash!==createHash('sha256').update(process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN).digest('hex'))throw new LiveError('oa_binding_unverified',403);
 return {id:row.id,active:!!(row.enabled&&!row.paused&&!row.deleted_at&&new Date(row.expires_at).getTime()>Date.now()),updatedAt:new Date(row.updated_at)};
}

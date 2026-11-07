import {database} from '../server/db';
import type {Pool} from 'pg';
import {OwnerError} from './errors';
import {createHash} from 'node:crypto';
/** The runtime is single OA. A request supplies no OA identifier; only the
 * server-side binding may resolve its service. No binding means fail closed. */
export async function requireConnectedOaActive(db:Pool=database()){const id=process.env.CONNECTED_LINE_OA_ID;if(!id||!process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN)throw new OwnerError('oa_binding_unverified',503);const result=await db.query<{enabled:boolean;paused:boolean;active:boolean;verified_token_hash:string|null}>(`SELECT enabled,paused,expires_at>now() AS active,verified_token_hash FROM oa_service_control WHERE line_oa_id=$1 AND deleted_at IS NULL`,[id]);if(result.rowCount!==1||!result.rows[0].enabled||result.rows[0].paused||!result.rows[0].active||result.rows[0].verified_token_hash!==createHash('sha256').update(process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN).digest('hex'))throw new OwnerError('oa_service_inactive',403)}

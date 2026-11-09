import {createHash} from 'node:crypto';
import type {Pool} from 'pg';
import {providerPairConfigured} from '../topup/line-provider';

/** Validated against current database state; no client-supplied OA identifier. */
export async function singleOaReady(db:Pick<Pool,'query'>){
 const id=process.env.CONNECTED_LINE_OA_ID,token=process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN;
 if(!id||!token||!providerPairConfigured()||!process.env.LINE_MESSAGING_CHANNEL_SECRET||!process.env.LINE_LOGIN_CHANNEL_SECRET||!process.env.NEXT_PUBLIC_LINE_LIFF_ID)return false;
 const result=await db.query(`SELECT line_oa_id,verified_token_hash,enabled,paused,deleted_at,expires_at
  FROM oa_service_control WHERE enabled=true AND deleted_at IS NULL LIMIT 2`);
 if(result.rows.length!==1)return false;
 const oa=result.rows[0];
 return oa.line_oa_id===id&&oa.enabled===true&&oa.paused===false&&new Date(oa.expires_at)>new Date()
  &&oa.verified_token_hash===createHash('sha256').update(token).digest('hex');
}

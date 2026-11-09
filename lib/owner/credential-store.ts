import {randomBytes} from 'node:crypto';
import type {Pool} from 'pg';
import {encryptOaSecret,decryptOaSecret} from '../server/oa-crypto';
import {OwnerError} from './errors';
import {verifyConnectedBot} from './verify-bot';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Input={loginChannelId:string;messagingChannelId:string;liffId:string;loginSecret:string;messagingSecret:string;accessToken:string};
function valid(input:Input){return !!input&&typeof input==='object'&&(['loginChannelId','messagingChannelId','liffId','loginSecret','messagingSecret','accessToken'] as const).every(k=>typeof input[k]==='string'&&input[k].length>=1&&input[k].length<=1024)&&input.loginChannelId!==input.messagingChannelId&&input.liffId.length<=255&&input.loginChannelId.length<=255&&input.messagingChannelId.length<=255}
export async function rotateOaCredentials(db:Pool,oaId:string,actor:string,input:Input,verifyBot=verifyConnectedBot){
 if(!uuid.test(oaId)||typeof actor!=='string'||!actor||!valid(input))throw new OwnerError('oa_credential_invalid',400);
 const c=await db.connect();try{
  await c.query('BEGIN');const oa=await c.query('SELECT id,line_oa_id,enabled FROM oa_service_control WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[oaId]);
  if(oa.rowCount!==1)throw new OwnerError('oa_not_found',404);
  await verifyBot(oa.rows[0].line_oa_id,input.accessToken);
  const existing=await c.query('SELECT key_version,webhook_key FROM oa_credentials WHERE oa_id=$1 FOR UPDATE',[oaId]);
  const version=existing.rows[0]?Number(existing.rows[0].key_version)+1:1;
  const webhookKey=existing.rows[0]?.webhook_key??randomBytes(32).toString('base64url');
  await c.query(`INSERT INTO oa_credentials(oa_id,webhook_key,login_channel_id,messaging_channel_id,liff_id,login_secret_ciphertext,messaging_secret_ciphertext,access_token_ciphertext,key_version,updated_by)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
   ON CONFLICT(oa_id) DO UPDATE SET login_channel_id=excluded.login_channel_id,messaging_channel_id=excluded.messaging_channel_id,liff_id=excluded.liff_id,login_secret_ciphertext=excluded.login_secret_ciphertext,messaging_secret_ciphertext=excluded.messaging_secret_ciphertext,access_token_ciphertext=excluded.access_token_ciphertext,key_version=excluded.key_version,updated_by=excluded.updated_by,updated_at=now()`,
   [oaId,webhookKey,input.loginChannelId,input.messagingChannelId,input.liffId,encryptOaSecret(oaId,'login-secret',input.loginSecret),encryptOaSecret(oaId,'messaging-secret',input.messagingSecret),encryptOaSecret(oaId,'access-token',input.accessToken),version,actor]);
  await c.query('INSERT INTO oa_credential_audit(oa_id,key_version,actor,action) VALUES($1,$2,$3,$4)',[oaId,version,actor,version===1?'CREATE':'ROTATE']);
  await c.query('COMMIT');return {oaId,keyVersion:version,webhookKey};
 }catch(error){await c.query('ROLLBACK').catch(()=>{});throw error}finally{c.release()}
}
export async function resolveWebhookOa(db:Pool,webhookKey:string){
 if(!/^[A-Za-z0-9_-]{32,128}$/.test(webhookKey))return null;
 const r=await db.query(`SELECT c.oa_id,c.messaging_channel_id,c.messaging_secret_ciphertext,c.access_token_ciphertext,c.key_version
  FROM oa_credentials c JOIN oa_service_control o ON o.id=c.oa_id
  WHERE c.webhook_key=$1 AND o.enabled=true AND o.paused=false AND o.deleted_at IS NULL AND o.expires_at>now()`,[webhookKey]);
 if(r.rowCount!==1)return null;const row=r.rows[0];
 return {oaId:row.oa_id as string,channelId:row.messaging_channel_id as string,keyVersion:Number(row.key_version),channelSecret:decryptOaSecret(row.oa_id,'messaging-secret',row.messaging_secret_ciphertext),accessToken:decryptOaSecret(row.oa_id,'access-token',row.access_token_ciphertext)};
}
export async function resolveLoginOa(db:Pool,webhookKey:string){
 if(!/^[A-Za-z0-9_-]{32,128}$/.test(webhookKey))return null;
 const r=await db.query(`SELECT c.oa_id,c.login_channel_id,c.liff_id FROM oa_credentials c JOIN oa_service_control o ON o.id=c.oa_id
  WHERE c.webhook_key=$1 AND o.enabled=true AND o.paused=false AND o.deleted_at IS NULL AND o.expires_at>now()`,[webhookKey]);
 if(r.rowCount!==1)return null;
 return {oaId:r.rows[0].oa_id as string,loginChannelId:r.rows[0].login_channel_id as string,liffId:r.rows[0].liff_id as string};
}

import 'server-only';
import {database} from './db';
import {parseEmbedUrl} from '../external-live';
import type {ExternalLiveState} from '../external-live';
const columns='status,provider,embed_url AS "embedUrl",updated_at AS "updatedAt"';
export async function readExternalLive():Promise<ExternalLiveState>{const result=await database().query(`SELECT ${columns} FROM external_live_settings WHERE id=1`);const row=result.rows[0];if(!row)throw new Error('live_settings_missing');return {...row,updatedAt:new Date(row.updatedAt).toISOString()}}
export async function saveExternalLiveUrl(input:unknown,actor:string){const value=parseEmbedUrl(input);await database().query("UPDATE external_live_settings SET embed_url=$1,provider=$2,status='READY',updated_at=now(),updated_by=$3 WHERE id=1",[value.embedUrl,value.provider,actor]);return readExternalLive()}
export async function setExternalLiveStatus(next:'LIVE'|'OFFLINE',actor:string){const result=await database().query(`UPDATE external_live_settings SET status=CASE WHEN $1='LIVE' THEN 'LIVE' ELSE 'OFFLINE' END,updated_at=now(),updated_by=$2 WHERE id=1 AND ($1='OFFLINE' OR embed_url IS NOT NULL) RETURNING id`,[next,actor]);if(!result.rowCount)throw new Error('live_url_missing');return readExternalLive()}

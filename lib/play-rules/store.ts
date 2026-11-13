import type {Pool} from 'pg';
import {connectedOa} from '../../modules/external-live/server/authorization';

export async function readPlayRules(db:Pool,channelId:string|undefined){
 const oa=await connectedOa(db,channelId);
 const result=await db.query<{content:string;updated_at:Date}>('SELECT content,updated_at FROM play_rules WHERE oa_id=$1',[oa.id]);
 return {content:result.rows[0]?.content??'',updatedAt:result.rows[0]?.updated_at??null};
}
export async function savePlayRules(db:Pool,channelId:string|undefined,actor:string,content:unknown){
 if(typeof content!=='string'||content.length>10000)throw new Error('invalid_play_rules');
 const oa=await connectedOa(db,channelId);
 const result=await db.query<{content:string;updated_at:Date}>(`INSERT INTO play_rules(oa_id,content,updated_by) VALUES($1,$2,$3)
 ON CONFLICT (oa_id) DO UPDATE SET content=EXCLUDED.content,updated_at=now(),updated_by=EXCLUDED.updated_by
 RETURNING content,updated_at`,[oa.id,content,actor]);
 return {content:result.rows[0].content,updatedAt:result.rows[0].updated_at};
}

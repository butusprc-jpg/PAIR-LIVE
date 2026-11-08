import {randomUUID} from 'node:crypto';
import {database} from '../server/db';
// Best-effort process-local batch; Vercel instances can stop before a partial batch flushes.
// Dashboard labels this counter PARTIAL and never treats it as billing data.
const batches=new Map<string,{count:number;flushAt:number;flushing:boolean}>();
let binding:{id:string|null;expires:number}|undefined;
export async function recordAuthenticatedApiRequest(){
 const configured=process.env.CONNECTED_LINE_OA_ID;
 if(!configured)return;
 const now=Date.now();
 if(!binding||binding.expires<now){const r=await database().query<{id:string}>('SELECT id FROM oa_service_control WHERE line_oa_id=$1 AND deleted_at IS NULL AND enabled=true LIMIT 1',[configured]);binding={id:r.rows[0]?.id||null,expires:now+60000}}
 const id=binding.id;if(!id)return;
 let b=batches.get(id);if(!b){b={count:0,flushAt:now+30000,flushing:false};batches.set(id,b)}b.count++;
 if(b.count>=25||now>=b.flushAt)await flushApiBatch(id);
}
export async function flushApiBatch(oaId:string){const b=batches.get(oaId);if(!b||b.flushing||b.count===0)return 0;
 b.flushing=true;const count=b.count;b.count=0;b.flushAt=Date.now()+30000;
 try{const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const c=await database().connect();try{await c.query('BEGIN');const insert=await c.query('INSERT INTO owner_usage_api_batches(batch_id,oa_id,usage_date,request_count) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING batch_id',[randomUUID(),oaId,date,count]);if(insert.rowCount)await c.query(`INSERT INTO owner_usage_daily(oa_id,usage_date,api_requests,source_status) VALUES($1,$2,$3,'PARTIAL') ON CONFLICT(oa_id,usage_date) DO UPDATE SET api_requests=coalesce(owner_usage_daily.api_requests,0)+excluded.api_requests,updated_at=now()`,[oaId,date,count]);await c.query('COMMIT')}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}}
 catch{b.count+=count;return 0}finally{b.flushing=false}
 return count;
}

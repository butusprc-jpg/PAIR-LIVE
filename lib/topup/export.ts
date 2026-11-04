import type {Pool} from 'pg';
import {TopupError} from './store';
export type HistoryFilter={from?:string;to?:string;status?:string;search?:string};
export function historyFilter(q:URLSearchParams,now=new Date()):HistoryFilter{
 const period=q.get('period')||'all',status=q.get('status')||'';
 if(status&&!['PENDING','APPROVED','REJECTED'].includes(status))throw new TopupError('invalid_status');
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 const current=new Date(day+'T00:00:00+07:00');
 let from='',to='';
 if(period==='today'||period==='yesterday'){
  if(period==='yesterday')current.setUTCDate(current.getUTCDate()-1);
  from=current.toISOString();current.setUTCDate(current.getUTCDate()+1);to=current.toISOString();
 }else if(period==='range'){
  const a=q.get('from')||'',b=q.get('to')||'';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(a)||!/^\d{4}-\d{2}-\d{2}$/.test(b)||a>b||!Number.isFinite(Date.parse(a+'T00:00:00+07:00'))||!Number.isFinite(Date.parse(b+'T00:00:00+07:00')))throw new TopupError('invalid_date_range');
  from=new Date(a+'T00:00:00+07:00').toISOString();const end=new Date(b+'T00:00:00+07:00');end.setUTCDate(end.getUTCDate()+1);to=end.toISOString();
 }else if(period!=='all')throw new TopupError('invalid_period');
 return {from:from||undefined,to:to||undefined,status:status||undefined,...(q.get('search')?{search:q.get('search')!.slice(0,200)}:{})};
}
export function csvCell(value:unknown){let s=String(value??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'');if(/^[\s]*[=+\-@]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'}
const clock=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'});
export function csvRow(r:Record<string,unknown>){const created=new Date(String(r.created_at));return [date.format(created),clock.format(created),r.id,r.member_id,r.display_name,r.requested_points,r.status,r.approved_by||'',r.approved_at?date.format(new Date(String(r.approved_at)))+' '+clock.format(new Date(String(r.approved_at))):'',r.admin_note].map(csvCell).join(',')+'\r\n'}
const where=`($1::timestamptz IS NULL OR r.created_at >= $1) AND ($2::timestamptz IS NULL OR r.created_at < $2) AND ($3::text IS NULL OR r.status=$3) AND ($4::text IS NULL OR r.id::text=$4 OR m.display_name ILIKE '%'||$4||'%')`;
function args(f:HistoryFilter){return [f.from||null,f.to||null,f.status||null,f.search||null]}
export async function historySummary(pool:Pool,f:HistoryFilter){const c=await pool.connect();try{await c.query('BEGIN READ ONLY');await c.query("SELECT set_config('pair_live.topup_admin','true',true)");const r=await c.query(`SELECT count(*)::integer AS count,COALESCE(sum(r.requested_points),0)::text AS points FROM member_topup_requests r JOIN members m ON m.id=r.member_id WHERE ${where}`,args(f));await c.query('COMMIT');return r.rows[0]}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}}
export function historyCsv(pool:Pool,f:HistoryFilter){const encoder=new TextEncoder();let c:import('pg').PoolClient|undefined;let offset=0,done=false,first=true;
 return new ReadableStream<Uint8Array>({async pull(controller){try{
  if(first){c=await pool.connect();await c.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');await c.query("SELECT set_config('pair_live.topup_admin','true',true)");controller.enqueue(encoder.encode('\uFEFFDate,Time,Request ID,Member ID,Member Name,Points,Status,Approved By,Approved At,Note\r\n'));first=false;return}
  const rows=await c!.query(`SELECT r.id,r.member_id,m.display_name,r.requested_points,r.status,r.created_at,r.approved_at,r.admin_note,COALESCE(a.display_name,a.id::text) AS approved_by FROM member_topup_requests r JOIN members m ON m.id=r.member_id LEFT JOIN admin_identities a ON a.id=r.approved_by WHERE ${where} ORDER BY r.created_at,r.id LIMIT 250 OFFSET $5`,[...args(f),offset]);
  if(!rows.rows.length){done=true;await c!.query('COMMIT');c!.release();c=undefined;controller.close();return}
  offset+=rows.rows.length;
  controller.enqueue(encoder.encode(rows.rows.map(csvRow).join('')));
 }catch(e){if(c){try{await c.query('ROLLBACK')}catch{}c.release();c=undefined}controller.error(e)}},async cancel(){if(c&&!done){try{await c.query('ROLLBACK')}catch{}c.release();c=undefined}}});
}

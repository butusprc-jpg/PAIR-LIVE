import type {Pool,PoolClient} from 'pg';
import type {AdminRole} from '../modules/admin-auth/types';

export const financialReportRoles=['admin'] as const satisfies readonly AdminRole[];
export const roundReportRoles=['admin','operator','viewer'] as const satisfies readonly AdminRole[];
export type FinancialItem={id:string;type:'TOPUP'|'WITHDRAWAL';createdAt:string;points:number;status:string};
export type ApprovalItem={id:string;createdAt:string;type:'TOPUP'|'WITHDRAWAL';points:number;decision:string;approvedBy:string};
export type RoundParticipationItem={roundId:string;opensAt:string;status:string;participants:number;evenPoints:number;oddPoints:number};
const iso=(value:Date|string)=>new Date(value).toISOString();
async function readOnly<T>(pool:Pool,fn:(client:PoolClient)=>Promise<T>,financial=false):Promise<T>{
 const client=await pool.connect();
 try{await client.query('BEGIN READ ONLY');if(financial)await client.query("SELECT set_config('pair_live.topup_admin','true',true)");else await client.query('SET LOCAL row_security=off');const result=await fn(client);await client.query('COMMIT');return result}
 catch(error){await client.query('ROLLBACK');throw error}
 finally{client.release()}
}
export async function readFinancialReport(pool:Pool){return readOnly(pool,async client=>{
 const items=await client.query(`SELECT id,type,created_at,requested_points,status FROM (
  SELECT id,'TOPUP'::text AS type,created_at,requested_points,status FROM member_topup_requests
  UNION ALL SELECT id,'WITHDRAWAL'::text AS type,created_at,requested_points,status FROM member_withdrawal_requests
 ) requests ORDER BY created_at DESC,id DESC LIMIT 50`);
 const approvals=await client.query(`SELECT id,type,created_at,points,decision,approved_by FROM (
  SELECT a.id,'TOPUP'::text AS type,a.created_at,a.points,a.action AS decision,admin.display_name AS approved_by
  FROM member_topup_audit a JOIN admin_identities admin ON admin.id=a.admin_id
  UNION ALL
  SELECT a.request_id AS id,'WITHDRAWAL'::text AS type,a.created_at,a.points,a.action AS decision,admin.display_name AS approved_by
  FROM member_withdrawal_audit a JOIN admin_identities admin ON admin.id=a.admin_id
 ) decisions ORDER BY created_at DESC,id DESC LIMIT 50`);
 const mapped:FinancialItem[]=items.rows.map(row=>({id:String(row.id),type:row.type,createdAt:iso(row.created_at),points:Number(row.requested_points),status:String(row.status)}));
 const history:ApprovalItem[]=approvals.rows.map(row=>({id:String(row.id),type:row.type,createdAt:iso(row.created_at),points:Number(row.points),decision:String(row.decision),approvedBy:String(row.approved_by)}));
 return {items:mapped,totals:{topup:mapped.filter(row=>row.type==='TOPUP').reduce((sum,row)=>sum+row.points,0),withdrawal:mapped.filter(row=>row.type==='WITHDRAWAL').reduce((sum,row)=>sum+row.points,0)},approvals:history};
 },true)}
export async function readRoundParticipationReport(pool:Pool){return readOnly(pool,async client=>{
 const rounds=await client.query(`WITH latest AS (SELECT id,opens_at,status FROM rounds ORDER BY opens_at DESC,id DESC LIMIT 50)
 SELECT r.id,r.opens_at,r.status,COUNT(DISTINCT e.member_id)::int AS participants,
 COALESCE(SUM(e.demo_points) FILTER (WHERE e.side='even'),0)::bigint AS even_points,
 COALESCE(SUM(e.demo_points) FILTER (WHERE e.side='odd'),0)::bigint AS odd_points
 FROM latest r LEFT JOIN round_entries e ON e.round_id=r.id AND e.status<>'CANCELLED'
 GROUP BY r.id,r.opens_at,r.status ORDER BY r.opens_at DESC,r.id DESC`);
 const items:RoundParticipationItem[]=rounds.rows.map(row=>({roundId:String(row.id),opensAt:iso(row.opens_at),status:String(row.status),participants:Number(row.participants),evenPoints:Number(row.even_points),oddPoints:Number(row.odd_points)}));
 return {items};
 })}

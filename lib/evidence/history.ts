import 'server-only';
import {database} from '../server/db';
import {validRoundId} from './repository';
import {bangkokDate} from './statistics';
export type RoundSummary={roundId:string;dateBangkok:string;opensAt:string;closesAt:string;durationMinutes:number;status:string;fullDisplayText:string|null;lastDigit:string|null;parity:'EVEN'|'ODD'|null;settledAt:string|null;even:{uniqueMembers:number;entries:number;demoPoints:number};odd:{uniqueMembers:number;entries:number;demoPoints:number};evidenceStatus:'AVAILABLE'|'PENDING'|'NOT_AVAILABLE'};
const iso=(v:Date|string)=>new Date(v).toISOString();
export async function getRoundSummary(roundId:string):Promise<RoundSummary|null>{if(!validRoundId(roundId))throw new Error('invalid_round_id');const client=await database().connect();let result;try{await client.query('BEGIN READ ONLY');await client.query('SET LOCAL row_security = off');result=await client.query(`SELECT r.id,r.opens_at,r.closes_at,r.duration_minutes,r.status,r.settled_at,r.result_number,r.result_last_digit,r.result_parity,
 COUNT(DISTINCT e.member_id) FILTER (WHERE e.side='even' AND e.status<>'CANCELLED')::int AS even_members,
 COUNT(e.id) FILTER (WHERE e.side='even' AND e.status<>'CANCELLED')::int AS even_entries,
 COALESCE(SUM(e.demo_points) FILTER (WHERE e.side='even' AND e.status<>'CANCELLED'),0)::bigint AS even_points,
 COUNT(DISTINCT e.member_id) FILTER (WHERE e.side='odd' AND e.status<>'CANCELLED')::int AS odd_members,
 COUNT(e.id) FILTER (WHERE e.side='odd' AND e.status<>'CANCELLED')::int AS odd_entries,
 COALESCE(SUM(e.demo_points) FILTER (WHERE e.side='odd' AND e.status<>'CANCELLED'),0)::bigint AS odd_points,
 EXISTS(SELECT 1 FROM round_ocr_evidence p LEFT JOIN round_ocr_verification_decisions d ON d.evidence_id=p.id WHERE p.round_id=r.id AND COALESCE(d.decision,p.verification_status)='VERIFIED') AS has_evidence
 FROM rounds r LEFT JOIN round_entries e ON e.round_id=r.id WHERE r.id=$1 GROUP BY r.id`,[roundId]);await client.query('COMMIT')}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}const r=result.rows[0];if(!r)return null;const settled=r.status==='SETTLED'&&r.settled_at&&r.result_number&&r.result_last_digit&&r.result_parity;return {roundId:String(r.id),dateBangkok:bangkokDate(iso(r.opens_at)),opensAt:iso(r.opens_at),closesAt:iso(r.closes_at),durationMinutes:Number(r.duration_minutes),status:r.status,fullDisplayText:settled?String(r.result_number):null,lastDigit:settled?String(r.result_last_digit):null,parity:settled?r.result_parity:null,settledAt:settled?iso(r.settled_at):null,even:{uniqueMembers:Number(r.even_members),entries:Number(r.even_entries),demoPoints:Number(r.even_points)},odd:{uniqueMembers:Number(r.odd_members),entries:Number(r.odd_entries),demoPoints:Number(r.odd_points)},evidenceStatus:settled?(r.has_evidence?'AVAILABLE':'NOT_AVAILABLE'):'PENDING'};}
export async function listRoundSummaries(limit=30){if(!Number.isInteger(limit)||limit<1||limit>100)throw new Error('invalid_limit');const result=await database().query<{id:string}>('SELECT id FROM rounds ORDER BY opens_at DESC,id DESC LIMIT $1',[limit]);return Promise.all(result.rows.map(r=>getRoundSummary(String(r.id))))}

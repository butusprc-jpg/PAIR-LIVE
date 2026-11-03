import type {DailyReport,EntrySnapshot,ReportReader,ReportResult,RoundReport,RoundSnapshot,SideTotals} from '../types';
const ok=<T>(value:T):ReportResult<T>=>({ok:true,value});
const error=<T>(code:'INVALID_DATE'|'INVALID_ROUND_ID'|'NOT_FOUND'|'DATA_UNAVAILABLE'):ReportResult<T>=>({ok:false,error:code});
const datePattern=/^\d{4}-\d{2}-\d{2}$/;
export function validBangkokDate(date:string):boolean {
 if(!datePattern.test(date))return false;
 const stamp=new Date(`${date}T00:00:00Z`);
 return Number.isFinite(stamp.getTime())&&stamp.toISOString().slice(0,10)===date;
}
export function bangkokDate(iso:string):string {
 const date=new Date(iso);if(!Number.isFinite(date.getTime()))throw new Error('invalid_timestamp');
 return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
}
function sideTotals(entries:readonly EntrySnapshot[],side:'even'|'odd'):SideTotals {
 const matches=entries.filter(e=>e.side===side&&e.status!=='CANCELLED');
 return {uniqueMembers:new Set(matches.map(e=>e.memberId)).size,entries:matches.length,demoPoints:matches.reduce((n,e)=>n+e.demoPoints,0)};
}
export function formatRound(round:RoundSnapshot,entries:readonly EntrySnapshot[]):RoundReport {
 const confirmed=round.status==='SETTLED'&&round.settledAt!==null&&typeof round.resultNumber==='string'&&/^\d+$/.test(round.resultNumber);
 const lastDigit=confirmed?Number(round.resultNumber!.at(-1)):null;
 return {roundId:round.id,dateBangkok:bangkokDate(round.opensAt),opensAt:round.opensAt,closesAt:round.closesAt,
  durationMinutes:round.durationMinutes,status:round.status,confirmedOcrNumber:confirmed?round.resultNumber:null,
  lastDigit,result:lastDigit===null?(round.status==='CANCELLED'?'NOT_AVAILABLE':'PENDING'):lastDigit%2===0?'EVEN':'ODD',
  even:sideTotals(entries,'even'),odd:sideTotals(entries,'odd'),evidenceStatus:round.evidenceStatus,
  settledAt:confirmed?round.settledAt:null};
}
function csvCell(value:unknown):string {
 const text=String(value??'');
 // Prefix formula-like data to prevent spreadsheet formula execution while preserving Thai UTF-8 text.
 const safe=/^[\s]*[=+\-@]/.test(text)?`'${text}`:text;
 return `"${safe.replaceAll('"','""')}"`;
}
export function dailyCsv(report:DailyReport):string {
 const header=['วันที่','หมายเลขรอบ','เวลาเปิด','เวลาปิด','สถานะ','เลข OCR','หลักสุดท้าย','ผล','สมาชิกคู่ไม่ซ้ำ','รายการคู่','คะแนนคู่','สมาชิกคี่ไม่ซ้ำ','รายการคี่','คะแนนคี่','หลักฐาน','เวลายืนยัน'];
 const rows=report.rounds.map(r=>[r.dateBangkok,r.roundId,r.opensAt,r.closesAt,r.status,r.confirmedOcrNumber??'',r.lastDigit??'',r.result,r.even.uniqueMembers,r.even.entries,r.even.demoPoints,r.odd.uniqueMembers,r.odd.entries,r.odd.demoPoints,r.evidenceStatus,r.settledAt??'']);
 return '\uFEFF'+[header,...rows].map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n';
}
export function createReportService(reader:ReportReader){
 async function getRoundReport(roundId:string):Promise<ReportResult<RoundReport>>{
  if(typeof roundId!=='string'||!/^\d+$/.test(roundId))return error('INVALID_ROUND_ID');
  try{const round=await reader.getRound(roundId);if(!round)return error('NOT_FOUND');const entries=await reader.getEntries([roundId]);return ok(formatRound(round,entries));}
  catch{return error('DATA_UNAVAILABLE')}
 }
 async function getDailyReport(date:string):Promise<ReportResult<DailyReport>>{
  if(!validBangkokDate(date))return error('INVALID_DATE');
  try{
   const rounds=await reader.listRoundsForBangkokDate(date);const entries=await reader.getEntries(rounds.map(r=>r.id));const matching=rounds.map(r=>formatRound(r,entries.filter(e=>e.roundId===r.id)));
   const counts=await reader.getDeliveryCounts(date);
   return ok({dateBangkok:date,totalRounds:matching.length,settledRounds:matching.filter(r=>r.status==='SETTLED').length,
    pendingOcrRounds:matching.filter(r=>['CLOSED','SCANNING'].includes(r.status)).length,
    reviewRequiredRounds:matching.filter(r=>r.status==='REVIEW_REQUIRED').length,cancelledRounds:matching.filter(r=>r.status==='CANCELLED').length,
    uniqueMembers:new Set(entries.filter(e=>e.status!=='CANCELLED').map(e=>e.memberId)).size,
    totalEntries:entries.filter(e=>e.status!=='CANCELLED').length,totalDemoPoints:entries.filter(e=>e.status!=='CANCELLED').reduce((n,e)=>n+e.demoPoints,0),
    evenResults:matching.filter(r=>r.result==='EVEN').length,oddResults:matching.filter(r=>r.result==='ODD').length,
    notificationsSent:counts.sent,notificationsFailed:counts.failed,rounds:matching});
  }catch{return error('DATA_UNAVAILABLE')}
 }
 async function exportDailyCsv(date:string):Promise<ReportResult<string>> {const report=await getDailyReport(date);return report.ok?ok(dailyCsv(report.value)):report;}
 return {getRoundReport,getDailyReport,exportDailyCsv};
}

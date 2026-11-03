export type RoundStatus='OPEN'|'CLOSED'|'SCANNING'|'REVIEW_REQUIRED'|'SETTLED'|'CANCELLED';
export type ResultSide='EVEN'|'ODD'|'PENDING'|'NOT_AVAILABLE';
export type ReportErrorCode='INVALID_DATE'|'INVALID_ROUND_ID'|'NOT_FOUND'|'DATA_UNAVAILABLE';
export type ReportResult<T>={ok:true;value:T}|{ok:false;error:ReportErrorCode};
export interface RoundSnapshot {
 id:string;opensAt:string;closesAt:string;durationMinutes:number;status:RoundStatus;
 settledAt:string|null;resultNumber:string|null;
 /** Evidence is supplied by an authorized Core event or future schema, never inferred. */
 evidenceStatus:'PENDING'|'AVAILABLE'|'NOT_AVAILABLE';
}
export interface EntrySnapshot {roundId:string;memberId:string;side:'even'|'odd';demoPoints:number;status:string}
export interface SideTotals {uniqueMembers:number;entries:number;demoPoints:number}
export interface RoundReport {
 roundId:string;dateBangkok:string;opensAt:string;closesAt:string;durationMinutes:number;status:RoundStatus;
 confirmedOcrNumber:string|null;lastDigit:number|null;result:ResultSide;
 even:SideTotals;odd:SideTotals;evidenceStatus:'PENDING'|'AVAILABLE'|'NOT_AVAILABLE';settledAt:string|null;
}
export interface DailyReport {
 dateBangkok:string;totalRounds:number;settledRounds:number;pendingOcrRounds:number;
 reviewRequiredRounds:number;cancelledRounds:number;uniqueMembers:number;totalEntries:number;
 totalDemoPoints:number;evenResults:number;oddResults:number;notificationsSent:number;notificationsFailed:number;
 rounds:RoundReport[];
}
export interface ReportReader {
 getRound(roundId:string):Promise<RoundSnapshot|null>;
 listRoundsForBangkokDate(date:string):Promise<RoundSnapshot[]>;
 getEntries(roundIds:readonly string[]):Promise<EntrySnapshot[]>;
 getDeliveryCounts(date:string):Promise<{sent:number;failed:number}>;
}

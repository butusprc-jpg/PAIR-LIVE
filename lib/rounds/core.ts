export type RoundStatus='OPEN'|'CLOSED'|'SCANNING'|'REVIEW_REQUIRED'|'SETTLED'|'CANCELLED';
export type Round={id:string;opensAt:string;closesAt:string;durationMinutes:number;status:RoundStatus;closedAt:string|null;settledAt:string|null;resultNumber:string|null};
export type EntryInput={side:'even'|'odd';demoPoints:number;idempotencyKey:string};
export class RoundError extends Error{constructor(public code:string,public status=400){super(code)}}
export function validateDuration(value:number){if(!Number.isInteger(value)||value<1||value>60)throw new RoundError('invalid_duration');return value}
export function validateEntry(input:EntryInput){if(input.side!=='even'&&input.side!=='odd')throw new RoundError('invalid_side');if(!Number.isInteger(input.demoPoints)||input.demoPoints<1||input.demoPoints>1000000)throw new RoundError('invalid_demo_points');if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.idempotencyKey))throw new RoundError('invalid_idempotency_key')}
export function closesAt(opensAt:string,durationMinutes:number){return new Date(new Date(opensAt).getTime()+validateDuration(durationMinutes)*60000).toISOString()}
export function remainingSeconds(round:Pick<Round,'closesAt'|'status'>,serverNow:string){return round.status==='OPEN'?Math.max(0,Math.ceil((new Date(round.closesAt).getTime()-new Date(serverNow).getTime())/1000)):0}
export function effectiveStatus(round:Pick<Round,'closesAt'|'status'>,serverNow:string):RoundStatus{return round.status==='OPEN'&&new Date(serverNow)>=new Date(round.closesAt)?'CLOSED':round.status}
export function canAccept(round:Pick<Round,'closesAt'|'status'>,serverNow:string){return effectiveStatus(round,serverNow)==='OPEN'}
export function nextStatus(status:RoundStatus,expired:boolean):RoundStatus{if(status==='OPEN'&&expired)return 'CLOSED';if(status==='CLOSED')return 'SCANNING';return status}
export function formatBangkok(value:string){return new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',dateStyle:'medium',timeStyle:'short'}).format(new Date(value))}

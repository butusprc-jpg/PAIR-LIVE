export function serverClockOffset(serverTime:string,sentAt:number,receivedAt:number){
 const server=Date.parse(serverTime);
 return Number.isFinite(server)?server-(sentAt+receivedAt)/2:0;
}
export function remainingRoundSeconds(closesAt:string,now:number,offset:number){
 const close=Date.parse(closesAt);
 return Number.isFinite(close)?Math.max(0,Math.ceil((close-now-offset)/1000)):0;
}
export function roundClock(seconds:number){const safe=Math.max(0,Math.floor(seconds));return `${String(Math.floor(safe/60)).padStart(2,'0')}:${String(safe%60).padStart(2,'0')}`}

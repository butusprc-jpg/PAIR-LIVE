/** Browser Performance entries contain phase names and durations only. */
export function recordClientTiming(name:string,start:number){
 if(!/^[a-z.]{3,48}$/.test(name)||typeof performance==='undefined')return;
 const end=performance.now();if(Number.isFinite(start)&&start>=0&&end>=start){const label=`pair.${name}`;if(performance.getEntriesByName(label,'measure').length>=100)performance.clearMeasures(label);performance.measure(label,{start,end})}
}

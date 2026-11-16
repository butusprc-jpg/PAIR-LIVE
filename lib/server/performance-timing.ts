/** Fixed phase names and durations only. Never include IDs, SQL, tokens or request data. */
export class RequestTiming{
 private readonly phases:{name:string;duration:number}[]=[];
 async measure<T>(name:string,work:()=>Promise<T>):Promise<T>{
  const start=performance.now();try{return await work()}finally{this.add(name,performance.now()-start)}
 }
 add(name:string,duration:number){if(!/^[a-z_]{2,24}$/.test(name)||!Number.isFinite(duration))throw new Error('invalid_performance_phase');this.phases.push({name,duration})}
 header(){return this.phases.map(({name,duration})=>`${name};dur=${duration.toFixed(1)}`).join(', ')}
}

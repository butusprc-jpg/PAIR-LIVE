type DispatchResult={status?:string;errorCode?:string|null}|null;
type Job={name:'broadcast'|'countdown'|'live_start'|'result';dispatch:()=>Promise<DispatchResult>};
type Metric={name:Job['name'];durationMs:number;status:string;errorCode?:string|null};

/** Runs existing outbox dispatchers outside the round tick, with at most one batch in flight. */
export function createWorkerLinePump(jobs:Job[],report:(metric:Metric)=>void){
 let pending:Promise<void>|null=null;
 return {
  kick(){
   if(pending)return false;
   pending=(async()=>{for(const job of jobs){const start=performance.now();try{const result=await job.dispatch();report({name:job.name,durationMs:performance.now()-start,status:result?.status??'EMPTY',errorCode:result?.errorCode})}catch{report({name:job.name,durationMs:performance.now()-start,status:'ERROR'});break}}})().finally(()=>{pending=null});
   return true;
  },
  async drain(){await pending}
 };
}

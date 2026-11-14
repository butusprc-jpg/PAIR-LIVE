import {tickRoundEngine} from '../lib/rounds/store';
import {database} from '../lib/server/db';
import {dispatchClosingBroadcast} from '../lib/line/round-broadcast';
import {dispatchCountdownLine} from '../lib/line/countdown-notify';
import {dispatchLiveStartLine} from '../lib/line/live-start-notify';
import {dispatchRoundResultLine} from '../lib/line/round-result-notify';
import {singleOaReady} from '../lib/server/single-oa';
async function main(){
 if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required');
 if(process.env.RAILWAY_STAGING_NO_LINE==='true')throw new Error('round_worker_staging_gate_closed');
 if(process.env.RAILWAY_SINGLE_OA_MODE==='true'&&!await singleOaReady(database()))throw new Error('single_oa_binding_invalid');
 let running=true;process.on('SIGTERM',()=>{running=false});process.on('SIGINT',()=>{running=false});
 while(running){try{if(process.env.RAILWAY_SINGLE_OA_MODE==='true'&&!await singleOaReady(database()))throw new Error('single_oa_binding_invalid');const state=await tickRoundEngine({allowAutoStart:false});const broadcast=await dispatchClosingBroadcast();const countdownLine=await dispatchCountdownLine();const liveLine=await dispatchLiveStartLine();const resultLine=await dispatchRoundResultLine();console.log(JSON.stringify({at:state.serverTime,roundId:state.round?.id,status:state.round?.status,broadcast:broadcast?{roundId:broadcast.roundId,status:broadcast.status,errorCode:broadcast.errorCode}:undefined,countdownLine,liveLine,resultLine}))}catch(error){console.error(JSON.stringify({status:'ERROR',errorCode:'round_worker_tick_failed',code:typeof error==='object'&&error!==null&&'code' in error&&typeof error.code==='string'&&/^[A-Z0-9_]{2,12}$/.test(error.code)?error.code:undefined}))}if(running)await new Promise(resolve=>setTimeout(resolve,1000))}
 await database().end();
}
main().catch(()=>{console.error(JSON.stringify({status:'ERROR',errorCode:'round_worker_fatal'}));process.exitCode=1});

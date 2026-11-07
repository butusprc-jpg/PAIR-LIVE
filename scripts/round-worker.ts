import {tickRoundEngine} from '../lib/rounds/store';
import {database} from '../lib/server/db';
import {dispatchClosingBroadcast} from '../lib/line/round-broadcast';
import {dispatchCountdownLine} from '../lib/line/countdown-notify';
async function main(){
 if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required');
 let running=true;process.on('SIGTERM',()=>{running=false});process.on('SIGINT',()=>{running=false});
 while(running){try{const state=await tickRoundEngine({allowAutoStart:false});const broadcast=await dispatchClosingBroadcast();const countdownLine=await dispatchCountdownLine();console.log(JSON.stringify({at:state.serverTime,roundId:state.round?.id,status:state.round?.status,broadcast:broadcast?{roundId:broadcast.roundId,status:broadcast.status,errorCode:broadcast.errorCode}:undefined,countdownLine}))}catch(error){console.error(JSON.stringify({status:'ERROR',errorCode:'round_worker_tick_failed',code:typeof error==='object'&&error!==null&&'code' in error&&typeof error.code==='string'&&/^[A-Z0-9_]{2,12}$/.test(error.code)?error.code:undefined}))}if(running)await new Promise(resolve=>setTimeout(resolve,1000))}
 await database().end();
}
main().catch(()=>{console.error(JSON.stringify({status:'ERROR',errorCode:'round_worker_fatal'}));process.exitCode=1});

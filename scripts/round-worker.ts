import {tickRoundEngine} from '../lib/rounds/store';
import {database} from '../lib/server/db';
async function main(){
 if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required');
 let running=true;process.on('SIGTERM',()=>{running=false});process.on('SIGINT',()=>{running=false});
 while(running){try{const state=await tickRoundEngine();console.log(JSON.stringify({at:state.serverTime,roundId:state.round?.id,status:state.round?.status}))}catch(error){console.error('round_tick_failed',error)}await new Promise(resolve=>setTimeout(resolve,1000))}
 await database().end();
}
main().catch(error=>{console.error(error);process.exitCode=1});

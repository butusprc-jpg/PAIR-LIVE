import {updateDurationForNextRound} from '../lib/rounds/store';
import {validateDuration} from '../lib/rounds/core';
import {database} from '../lib/server/db';
async function main(){if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required');const duration=validateDuration(Number(process.argv[2]));const result=await updateDurationForNextRound(duration);console.log(JSON.stringify(result));await database().end()}
main().catch(error=>{console.error(error);process.exitCode=1});

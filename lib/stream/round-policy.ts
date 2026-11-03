import {RoomServiceClient} from 'livekit-server-sdk';
import {database} from '../server/db';
import {liveKitConfig} from './livekit';
export function streamableStatus(status:string){return ['OPEN','CLOSED','SCANNING','REVIEW_REQUIRED'].includes(status)}
/** Called by the round scheduler before opening a new round. Fail closed on SFU errors. */
export async function enforceStreamRoomPolicy(){const config=liveKitConfig();if(!config)return;const latest=await database().query<{status:string}>('SELECT status FROM rounds ORDER BY id DESC LIMIT 1');if(!latest.rows[0]||streamableStatus(latest.rows[0].status))return;const service=new RoomServiceClient(config.url.replace(/^ws/,'http'),config.key,config.secret);try{await service.deleteRoom(config.room)}catch(error){const message=error instanceof Error?error.message:'';if(!/not found|does not exist|404/i.test(message))throw error}}

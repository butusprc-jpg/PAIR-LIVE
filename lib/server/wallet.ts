import 'server-only';
import {database} from './db';
import {createMemberWalletModule} from '../../modules/member-wallet';
import {createPostgresWalletStore} from '../../modules/member-wallet/server/postgres';
import {walletPathFromDatabase} from './wallet-cutover';
export async function walletRuntimeState():Promise<'active'|'closed'|'mismatch'>{const client=await database().connect();try{return (await walletPathFromDatabase(client))==='wallet'?'active':'closed'}catch{return 'mismatch'}finally{client.release()}}
export function walletModule(){return createMemberWalletModule<{id:string}>({store:createPostgresWalletStore(database()),members:{async memberId(member){return member.id}},admins:{async requireAdmin(){return null}},migrationComplete:true,production:process.env.NODE_ENV==='production'})}

import 'server-only';
import {database} from './db';
import {createMemberWalletModule} from '../../modules/member-wallet';
import {createPostgresWalletStore} from '../../modules/member-wallet/server/postgres';
export async function walletRuntimeState():Promise<'active'|'closed'|'mismatch'>{const state=await database().query("SELECT to_regclass('member_wallet_runtime_state') IS NOT NULL AS present");let enabled=false;if(state.rows[0]?.present){const gate=await database().query('SELECT enabled FROM member_wallet_runtime_state WHERE id=1');enabled=gate.rows[0]?.enabled===true}const configured=process.env.PAIR_WALLET_CUTOVER_VERIFIED==='true';return enabled===configured?(enabled?'active':'closed'):'mismatch'}
export function walletModule(){return createMemberWalletModule<{id:string}>({store:createPostgresWalletStore(database()),members:{async memberId(member){return member.id}},admins:{async requireAdmin(){return null}},migrationComplete:true,production:process.env.NODE_ENV==='production'})}

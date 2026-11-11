import type {Pool,PoolClient} from 'pg';
export type WalletPhase='LEGACY'|'CUTOVER_PENDING'|'WALLET_ACTIVE'|'WALLET_SUSPENDED';
export function walletPath(phase:WalletPhase,enabled:boolean,everCutover:boolean,environmentEnabled:boolean){
 if(phase==='LEGACY'&&!enabled&&!everCutover&&!environmentEnabled)return 'legacy' as const;
 if(phase==='WALLET_ACTIVE'&&enabled&&everCutover&&environmentEnabled)return 'wallet' as const;
 throw new Error('wallet_cutover_gate_mismatch');
}
export async function walletPathFromDatabase(client:Pick<PoolClient,'query'>){const exists=await client.query("SELECT to_regclass('member_wallet_runtime_state') IS NOT NULL AS present");const environmentEnabled=process.env.PAIR_WALLET_CUTOVER_VERIFIED==='true';if(!exists.rows[0]?.present)return walletPath('LEGACY',false,false,environmentEnabled);
 const state=await client.query('SELECT phase,enabled,ever_cutover FROM member_wallet_runtime_state WHERE id=1 FOR SHARE');const row=state.rows[0];if(!row)throw new Error('wallet_cutover_gate_mismatch');return walletPath(row.phase,row.enabled===true,row.ever_cutover===true,environmentEnabled)}
export async function memberAvailablePoints(pool:Pool,memberId:string,legacyPoints:number){
 const c=await pool.connect();
 try{await c.query('BEGIN');await c.query("SELECT set_config('pair_live.member_id',$1,true)",[memberId]);
  const path=await walletPathFromDatabase(c);
  const balance=path==='wallet'?Number((await c.query('SELECT available_points FROM member_wallets WHERE member_id=$1',[memberId])).rows[0]?.available_points??0):legacyPoints;
  await c.query('COMMIT');return balance;
 }catch(error){await c.query('ROLLBACK');throw error}finally{c.release()}
}

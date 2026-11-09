import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {Pool} from 'pg';
import {assertTestTarget} from '../lib/migration-manifest';
import {requireConnectedOaActive} from '../lib/owner/service-gate';

async function main(){
const url=assertTestTarget(process.env.DATABASE_URL);
const oa=`@round_test_${randomUUID().slice(0,12)}`;
const token=`synthetic-round-test-${randomUUID()}`;
const pool=new Pool({connectionString:url,ssl:false});
let id:string|undefined;
try{
 const inserted=await pool.query("INSERT INTO oa_service_control(line_oa_id,shop_name,enabled,paused,expires_at,verified_token_hash) VALUES($1,'Round CI fixture',true,false,now()+interval '1 day',$2) RETURNING id",[oa,createHash('sha256').update(token).digest('hex')]);
 id=inserted.rows[0].id;
 const env={...process.env,DATABASE_URL:url,CONNECTED_LINE_OA_ID:oa,LINE_MESSAGING_CHANNEL_ACCESS_TOKEN:token,LINE_LOGIN_CHANNEL_ID:'round-test-login',LINE_MESSAGING_CHANNEL_ID:'round-test-messaging',LINE_LOGIN_PROVIDER_ID:'round-test-provider',LINE_MESSAGING_PROVIDER_ID:'round-test-provider',PAIR_ROUND_MODE_TEST_ISOLATED:'1',PAIR_BUSINESS_TEST_ISOLATED:'1',PAIR_MANUAL_START_TEST_ISOLATED:'1',PAIR_ROUND_RULES_TEST_ISOLATED:'1'};
 const oldId=process.env.CONNECTED_LINE_OA_ID,oldToken=process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN;
 process.env.CONNECTED_LINE_OA_ID=oa;process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN=token;
 await requireConnectedOaActive(pool);
 process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN='unverified-synthetic-token';
 let rejected=false;try{await requireConnectedOaActive(pool)}catch{rejected=true}
 if(!rejected)throw Error('unverified OA was accepted');
 if(oldId===undefined)delete process.env.CONNECTED_LINE_OA_ID;else process.env.CONNECTED_LINE_OA_ID=oldId;
 if(oldToken===undefined)delete process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN;else process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN=oldToken;
 const result=spawnSync(process.execPath,['--import','tsx','--test','--test-concurrency=1','tests/manual-start-db.integration.test.ts','tests/round-mode-db.integration.test.ts','tests/round-rules-db.integration.test.ts','tests/round-business-db.integration.test.ts'],{env,stdio:'inherit'});
 if(result.error)throw result.error;
 if(result.status!==0)process.exitCode=result.status||1;
}finally{
 if(id)await pool.query('DELETE FROM oa_service_control WHERE id=$1',[id]);
 await pool.end();
}

}
void main().catch(error=>{console.error(error);process.exitCode=1});

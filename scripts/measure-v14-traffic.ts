import {createHash,randomBytes} from 'node:crypto';
import {existsSync} from 'node:fs';
import {spawn,type ChildProcess} from 'node:child_process';
import {Pool} from 'pg';
import {chromium,type Browser} from 'playwright-core';
import {assertTestTarget} from '../lib/migration-manifest';

const testUrl=assertTestTarget(process.env.MIGRATION_TEST_DATABASE_URL);
const base=new URL(testUrl),beforeUrl=new URL(testUrl);beforeUrl.pathname='/pair_live_before';
const channel='synthetic-perf-login',oa='@synthetic-perf-oa',lineToken='synthetic-perf-line-token';
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
type Sample={requests:number;latencies:number[];errors:number};

async function seed(url:string){
 const db=new Pool({connectionString:url,ssl:false});
 try{
  await db.query("INSERT INTO oa_service_control(line_oa_id,shop_name,enabled,expires_at,verified_token_hash) VALUES($1,'Synthetic performance OA',true,now()+interval '1 day',$2)",[oa,hash(lineToken)]);
  const member=(await db.query("INSERT INTO members(display_name,demo_points) VALUES('Synthetic perf member',100) RETURNING id")).rows[0].id;
  await db.query("INSERT INTO member_identities(member_id,provider,provider_user_id,provider_channel_id) VALUES($1,'line','synthetic-perf-member',$2)",[member,channel]);
  const token=randomBytes(32).toString('base64url');
  await db.query("INSERT INTO member_sessions(token_hash,member_id,expires_at) VALUES($1,$2,now()+interval '12 hours')",[hash(token),member]);
  return token;
 }finally{await db.end()}
}
async function sqlCalls(url:string){
 const db=new Pool({connectionString:url,ssl:false});
 try{const result=await db.query("SELECT coalesce(sum(calls),0)::bigint AS n FROM pg_stat_statements WHERE dbid=(SELECT oid FROM pg_database WHERE datname=current_database()) AND query NOT LIKE '%pg_stat_statements%'");return Number(result.rows[0].n)}finally{await db.end()}
}
async function start(cwd:string,url:string,port:number):Promise<ChildProcess>{
 const child=spawn('npm',['run','start','--','-p',String(port)],{cwd,env:{...process.env,DATABASE_URL:url,CONNECTED_LINE_OA_ID:oa,LINE_MESSAGING_CHANNEL_ACCESS_TOKEN:lineToken,LINE_LOGIN_CHANNEL_ID:channel,NEXT_TELEMETRY_DISABLED:'1'},stdio:'ignore'});
 for(let attempt=0;attempt<60;attempt++){
  if(child.exitCode!==null)throw new Error(`server_${port}_exited`);
  try{const response=await fetch(`http://127.0.0.1:${port}/api/auth/runtime`);if(response.ok)return child}catch{}
  await new Promise(resolve=>setTimeout(resolve,1000));
 }
 child.kill();throw new Error(`server_${port}_not_ready`);
}
async function open(browser:Browser,port:number,token:string){
 const context=await browser.newContext();
 await context.addCookies([{name:'pair_member_session',value:token,url:`http://127.0.0.1:${port}`,httpOnly:true,sameSite:'Lax'}]);
 const page=await context.newPage(),sample:Sample={requests:0,latencies:[],errors:0};
 let collecting=false;const started=new Map<unknown,number>();
 page.on('request',request=>{if(collecting&&request.url().startsWith(`http://127.0.0.1:${port}/api/`)){sample.requests++;started.set(request,performance.now())}});
 page.on('response',response=>{const begin=started.get(response.request());if(begin!==undefined){sample.latencies.push(performance.now()-begin);if(response.status()>=400)sample.errors++;started.delete(response.request())}});
 await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'domcontentloaded'});
 await page.getByText('ห้องถ่ายทอดสด').first().waitFor({timeout:30000});
 if(await page.evaluate(()=>document.visibilityState)!=='visible')throw new Error('browser_tab_not_visible');
 return {sample,begin:()=>{collecting=true},page,context};
}
async function main(){
 const chrome=['/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'].find(existsSync);
 if(!chrome)throw new Error('chromium_not_available_on_runner');
 const source=new Pool({connectionString:testUrl,ssl:false});
 try{await source.query('CREATE EXTENSION IF NOT EXISTS pg_stat_statements')}finally{await source.end()}
 const admin=new Pool({connectionString:new URL('/postgres',base).toString(),ssl:false});
 try{
  await admin.query('CREATE DATABASE pair_live_before TEMPLATE pair_live_migration_test');
 }finally{await admin.end()}
 const beforeToken=await seed(beforeUrl.toString()),afterToken=await seed(testUrl);
 const processes:ChildProcess[]=[],browsers:Browser[]=[];
 try{
  processes.push(await start('/tmp/pair-live-before',beforeUrl.toString(),3101));
  processes.push(await start(process.cwd(),testUrl,3102));
  browsers.push(await chromium.launch({executablePath:chrome,headless:true,args:['--no-sandbox']}));
  browsers.push(await chromium.launch({executablePath:chrome,headless:true,args:['--no-sandbox']}));
  const before=await open(browsers[0],3101,beforeToken),after=await open(browsers[1],3102,afterToken);
  const prior=[await sqlCalls(beforeUrl.toString()),await sqlCalls(testUrl)];
  before.begin();after.begin();const startAt=Date.now();
  await new Promise(resolve=>setTimeout(resolve,600_000));
  const next=[await sqlCalls(beforeUrl.toString()),await sqlCalls(testUrl)];
  const summarize=(sample:Sample,queries:number)=>{const sorted=sample.latencies.toSorted((a,b)=>a-b);return {requests:sample.requests,sqlCalls:queries,httpErrors:sample.errors,responses:sorted.length,meanMs:sorted.length?Math.round(sorted.reduce((a,b)=>a+b,0)/sorted.length):null,p95Ms:sorted.length?Math.round(sorted[Math.ceil(sorted.length*.95)-1]):null}};
  console.log('V14_PERFORMANCE_MEASURED '+JSON.stringify({durationSeconds:Math.round((Date.now()-startAt)/1000),environment:'disposable PostgreSQL 16, synthetic member, two visible headless Chrome browsers',baseline:'V14.4 84d80e6',before:summarize(before.sample,next[0]-prior[0]),after:summarize(after.sample,next[1]-prior[1])}));
 }finally{for(const browser of browsers)await browser.close();for(const child of processes)child.kill()}
}
void main().catch(error=>{console.error(error);process.exitCode=1});

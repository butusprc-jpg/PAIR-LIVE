import test from 'node:test';
import assert from 'node:assert/strict';
import {pushLine} from '../lib/topup/line-provider';
import {sendClosingBroadcast} from '../lib/line/round-broadcast';

const user='U'+'a'.repeat(32);

test('push retry preserves recipient, body and key; accepted 409 is terminal',async()=>{
 const attempts:{url:string;body:string;key:string|null}[]=[];
 const fetcher:typeof fetch=async(input,init)=>{
  attempts.push({url:String(input),body:String(init?.body),key:new Headers(init?.headers).get('X-Line-Retry-Key')});
  return new Response('',{status:attempts.length===1?503:409});
 };
 const message={type:'text',text:'อนุมัติเติม 100 แต้ม'};
 await assert.rejects(pushLine(user,[message],'synthetic-outbox-id',fetcher,'synthetic-token'));
 assert.equal(await pushLine(user,[message],'synthetic-outbox-id',fetcher,'synthetic-token'),409);
 assert.equal(attempts.length,2);
 assert.equal(attempts[0].url,'https://api.line.me/v2/bot/message/push');
 assert.deepEqual(attempts[0],attempts[1]);
 assert.deepEqual(JSON.parse(attempts[0].body),{to:user,messages:[message]});
});

test('closing broadcast keeps one Thai body and retry key after 429',async()=>{
 const posts:{body:string;key:string|null}[]=[];
 const fetcher:typeof fetch=async(input,init)=>{
  const url=String(input);
  if(url.endsWith('/quota'))return Response.json({type:'limited',value:100});
  if(url.endsWith('/consumption'))return Response.json({totalUsage:0});
  posts.push({body:String(init?.body),key:new Headers(init?.headers).get('X-Line-Retry-Key')});
  return new Response('',{status:posts.length===1?429:200});
 };
 const job={roundId:'42',retryKey:'synthetic-broadcast-key',attempts:0,closesAt:new Date(Date.now()+60_000).toISOString()};
 assert.equal((await sendClosingBroadcast(job,'synthetic-token',fetcher)).status,'FAILED');
 assert.equal((await sendClosingBroadcast(job,'synthetic-token',fetcher)).status,'SENT');
 assert.equal(posts.length,2);
 assert.deepEqual(posts[0],posts[1]);
 assert.equal(posts[0].key,job.retryKey);
 assert.match(posts[0].body,/เหลือเวลาอีก 1 นาที/);
});

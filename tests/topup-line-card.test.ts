import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {confirmationCard,confirmationData,parsePostback,requestCard,reviewData,resultMessage,signedSlipUrl,validSlipLink} from '../lib/topup/line-card';
import {acceptedLineEvents,handleLineWebhook} from '../lib/line-webhook-core';
import {createHmac} from 'node:crypto';
const actor='U'+'a'.repeat(32),other='U'+'b'.repeat(32),id=randomUUID(),now=Date.now();
const row={id,displayName:'lotus',points:500,createdAt:new Date(now),status:'รอตรวจสอบ'};
test('Flex card contains real request fields and signed image URL',()=>{
 const old=process.env.TOPUP_IMAGE_SIGNING_SECRET;process.env.TOPUP_IMAGE_SIGNING_SECRET='synthetic-32-byte-secret-for-card-tests';
 try{
  const url=signedSlipUrl('https://pair-live.example',id,now);const u=new URL(url);
  assert.equal(validSlipLink(id,u.searchParams.get('exp')!,u.searchParams.get('sig')!,now),true);
  assert.equal(validSlipLink(id,u.searchParams.get('exp')!,u.searchParams.get('sig')!,now+86401000),false);
  assert.equal(validSlipLink(randomUUID(),u.searchParams.get('exp')!,u.searchParams.get('sig')!,now),false);
  const card=requestCard(row,url);const json=JSON.stringify(card);for(const value of ['lotus','500','แจ้งเติมแต้ม',id,url,'postback'])assert.ok(json.includes(value),value);
  assert.equal((card.contents as {hero?:unknown}).hero!==undefined,true);
  const fallback=JSON.stringify(requestCard(row));assert.match(fallback,/ตรวจหลักฐานตามช่องทางที่ได้รับ/);assert.match(fallback,/topup:v2:review/);assert.doesNotMatch(fallback,/displayText/);const manual=JSON.stringify(requestCard(row,undefined,false,true));assert.match(manual,/topup:v2:review/);assert.doesNotMatch(manual,/ต้องตรวจภาพสลิป/);
  const primary=(requestCard(row) as {contents:{footer?:{contents:Array<{style?:string;color?:string,action:{data:string,displayText?:string}}>}}}).contents.footer?.contents;
  assert.ok(primary);assert.equal(primary?.[0]?.style,'primary');assert.equal(primary?.[0]?.color,'#1763DC');
  assert.equal(primary?.[0]?.action.data,reviewData(id,'APPROVED'));
  assert.equal(primary?.[0]?.action.displayText,undefined);
  assert.doesNotMatch(JSON.stringify(requestCard(row)),/quickReply/);
 const confirm=confirmationCard(row,'APPROVED',actor);assert.match(JSON.stringify(confirm),/ตรวจสลิปแล้ว ยืนยัน/);
  const token=confirmationData(id,'APPROVED',actor,now);
  assert.deepEqual(parsePostback(token,actor,now),{stage:'CONFIRM',decision:'APPROVED',id});
  assert.equal(parsePostback(token,other,now),null);
  assert.equal(parsePostback(token,actor,now+301000),null);
  assert.equal(parsePostback(token.slice(0,-1)+(token.endsWith('0')?'1':'0'),actor,now),null);
  assert.match(JSON.stringify(resultMessage(row,'APPROVED','Admin')),/ผู้ดำเนินการ: Admin/);
 }finally{if(old===undefined)delete process.env.TOPUP_IMAGE_SIGNING_SECRET;else process.env.TOPUP_IMAGE_SIGNING_SECRET=old}
});
test('webhook signed postback reaches handler only after signature verification',async()=>{
 const secret='synthetic-signature';const event={type:'postback',webhookEventId:'event_postback_1',source:{type:'user',userId:actor},postback:{data:`topup:v2:review:APPROVED:${id}`}};
 assert.equal(acceptedLineEvents({events:[event]}).length,1);
 const body=JSON.stringify({events:[event]});const signature=createHmac('sha256',secret).update(body).digest('base64');const events:string[]=[];
 const make=(sig:string)=>new Request('https://example.test/api/line/webhook',{method:'POST',headers:{'Content-Type':'application/json','X-Line-Signature':sig},body});
 assert.equal((await handleLineWebhook(make(signature),secret,async e=>{events.push(e.type)})).status,200);
 assert.equal((await handleLineWebhook(make('invalid'),secret,async e=>{events.push(e.type)})).status,401);
 assert.deepEqual(events,['postback']);
});

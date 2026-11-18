import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {Locale} from '../lib/i18n';
import {t,formatDate} from '../lib/i18n';
import {liveStartCard,countdownStartCard} from '../lib/line/start-cards';
import {resultNoticeCard} from '../lib/line/game-notices';
import {requestCard,confirmationCard,statusCard} from '../lib/topup/line-card';
import {withdrawalCard,withdrawalStatusCard} from '../lib/withdrawal/line';

const locales:Locale[]=['th','zh-CN','en'];
const stripText=(value:unknown):unknown=>{
 if(Array.isArray(value))return value.map(stripText);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,key==='text'||key==='altText'||key==='label'?'<localized>':stripText(item)]));
 return value;
};
const allText=(value:unknown)=>JSON.stringify(value);

test('every sent Flex Card type renders three languages without changing structure or postback data',()=>{
 process.env.NEXT_PUBLIC_APP_BASE_URL='https://example.test';
 process.env.TOPUP_IMAGE_SIGNING_SECRET='synthetic-32-byte-secret-for-card-tests';
 const id=randomUUID(),actor='U'+'a'.repeat(32);
 const row={id,displayName:'QA Member',points:100,createdAt:'2026-11-17T00:00:00.000Z',status:'PENDING'};
 const withdrawal={request_id:id,display_name:'QA Member',requested_points:100,payout_details:'QA account 123'};
 const factories:Array<(locale:Locale)=>unknown>=[
  (locale:Locale)=>liveStartCard('QA Shop',locale),
  (locale:Locale)=>countdownStartCard('125',60,locale),
  (locale:Locale)=>resultNoticeCard({roundId:'125',resultNumber:'5.8756',chosenSide:'even',stakePoints:100,outcome:'CORRECT',creditedPoints:190},locale),
  (locale:Locale)=>resultNoticeCard({roundId:'125',resultNumber:'5.8757',chosenSide:'even',stakePoints:100,outcome:'INCORRECT'},locale),
  (locale:Locale)=>requestCard(row,undefined,false,false,locale),
  (locale:Locale)=>confirmationCard(row,'APPROVED',actor,locale),
  (locale:Locale)=>confirmationCard(row,'REJECTED',actor,locale),
  (locale:Locale)=>statusCard({...row,status:'APPROVED'},locale),
  (locale:Locale)=>statusCard({...row,status:'REJECTED'},locale),
  (locale:Locale)=>withdrawalCard(withdrawal,locale),
  (locale:Locale)=>withdrawalStatusCard({...withdrawal,status:'TRANSFERRED'},locale),
  (locale:Locale)=>withdrawalStatusCard({...withdrawal,status:'REJECTED'},locale),
 ];
 assert.equal(factories.length,12);
 const required=[['QA Shop'],['125','60'],['125','5.8756','100','190'],['125','5.8757','100','0'],...Array.from({length:5},()=>[id,'100']),...Array.from({length:3},()=>[id,'100'])];
 for(const [index,factory] of factories.entries()){
  const cards=locales.map(locale=>factory(locale) as {type:string});
  for(const card of cards){assert.equal(card.type,'flex');assert.doesNotMatch(allText(card),/\{[a-zA-Z][a-zA-Z0-9_]*\}/);assert.ok(allText(card).includes('PAIR LIVE'));for(const value of required[index])assert.ok(allText(card).includes(value),`card ${index} missing ${value}`)}
  assert.deepEqual(stripText(cards[1]),stripText(cards[0]));
  assert.deepEqual(stripText(cards[2]),stripText(cards[0]));
 }
 for(const locale of locales){
  const request=allText(requestCard(row,undefined,false,false,locale));
  const confirm=allText(confirmationCard(row,'APPROVED',actor,locale));
  const withdraw=allText(withdrawalCard(withdrawal,locale));
  assert.ok(request.includes(id));assert.ok(confirm.includes(id));assert.ok(withdraw.includes(id));
  assert.ok(request.includes(formatDate(row.createdAt,locale,{dateStyle:'medium',timeStyle:'short'})));
  assert.ok(request.includes('100'));assert.ok(withdraw.includes('100'));
  assert.ok(request.includes('QA Member'));assert.ok(withdraw.includes('QA account 123'));
  assert.ok(request.includes(t('line.topup.card.requestTitle',locale)));
  assert.ok(withdraw.includes(t('line.withdraw.card.requestTitle',locale)));
  assert.ok(request.includes(`topup:v2:review:APPROVED:${id}`));
  assert.ok(withdraw.includes(`withdraw:v1:transfer:${id}`));
 }
});
test('Thai member notifications use natural points wording',()=>{
 assert.equal(t('line.topup.approved','th',{points:100}),'✅ เติมแต้มสำเร็จ 100 แต้ม');
 assert.equal(t('line.result.number','th',{number:'5.8756',side:'คู่'}),'ผลตัวเลข: 5.8756 (คู่)');
});

test('invalid and unsafe numeric inputs cannot render misleading cards',()=>{
 process.env.NEXT_PUBLIC_APP_BASE_URL='https://example.test';
 process.env.TOPUP_IMAGE_SIGNING_SECRET='synthetic-32-byte-secret-for-card-tests';
 const id=randomUUID(),row={id,displayName:'QA Member',points:100,createdAt:'2026-11-17T00:00:00.000Z',status:'PENDING'};
 const withdrawal={request_id:id,display_name:'QA Member',requested_points:100,payout_details:'QA account 123'};
 for(const points of [0,-1,1.5,Number.MAX_SAFE_INTEGER+1]){
  assert.throws(()=>requestCard({...row,points}),/invalid_line_card_input/);
  assert.throws(()=>withdrawalCard({...withdrawal,requested_points:points}),/invalid_withdrawal_card_input/);
 }
 assert.throws(()=>statusCard({...row,status:'UNKNOWN'}),/invalid_line_card_status/);
 assert.throws(()=>withdrawalStatusCard({...withdrawal,status:'UNKNOWN' as 'REJECTED'}),/invalid_withdrawal_card_status/);
 assert.throws(()=>requestCard({...row,id:'wrong'}),/invalid_request_id/);
 assert.throws(()=>withdrawalCard({...withdrawal,request_id:'wrong'}),/invalid_withdrawal_card_input/);
 assert.throws(()=>countdownStartCard('125',Number.MAX_SAFE_INTEGER+1),/invalid_countdown_card/);
 assert.throws(()=>resultNoticeCard({roundId:'125',resultNumber:'5.8756',chosenSide:'even',stakePoints:100,outcome:'CORRECT',creditedPoints:Number.MAX_SAFE_INTEGER+1}),/invalid_points/);
 assert.throws(()=>resultNoticeCard({roundId:'125',resultNumber:'5.8756',chosenSide:'even',stakePoints:Number.MAX_SAFE_INTEGER+1,outcome:'CORRECT',creditedPoints:190}),/invalid_result_notice/);
 assert.throws(()=>resultNoticeCard({roundId:'125',resultNumber:'5.8.756',chosenSide:'even',stakePoints:100,outcome:'CORRECT',creditedPoints:190}),/invalid_result_number/);
 assert.throws(()=>resultNoticeCard({roundId:'125',resultNumber:'5.8756',chosenSide:'even',stakePoints:100,outcome:'UNKNOWN' as 'CORRECT',creditedPoints:190}),/invalid_result_notice/);
});

test('re-rendering unchanged outbox input preserves numeric fields and references',()=>{
 const id=randomUUID(),row={id,displayName:'QA Member',points:100,createdAt:'2026-11-17T00:00:00.000Z',status:'PENDING'};
 assert.deepEqual(requestCard(row,undefined,false,false,'en'),requestCard(row,undefined,false,false,'en'));
 const withdrawal={request_id:id,display_name:'QA Member',requested_points:100,payout_details:'QA account 123'};
 assert.deepEqual(withdrawalCard(withdrawal,'zh-CN'),withdrawalCard(withdrawal,'zh-CN'));
 const result={roundId:'125',resultNumber:'5.8756',chosenSide:'even' as const,stakePoints:100,outcome:'CORRECT' as const,creditedPoints:190};
 assert.deepEqual(resultNoticeCard(result,'th'),resultNoticeCard(result,'th'));
});

test('credited Points are labeled as this-round credit, never wallet balance',()=>{
 for(const locale of locales){
  const text=allText(resultNoticeCard({roundId:'125',resultNumber:'5.8756',chosenSide:'even',stakePoints:100,outcome:'CORRECT',creditedPoints:190},locale));
  assert.ok(text.includes(t('line.result.total',locale,{points:190})));
  assert.doesNotMatch(text,/ยอดคงเหลือ|余额|balance/i);
 }
});

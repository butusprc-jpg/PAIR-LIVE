import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {Locale} from '../lib/i18n';
import {t} from '../lib/i18n';
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
  (locale:Locale)=>requestCard(row,undefined,false,false,locale),
  (locale:Locale)=>confirmationCard(row,'APPROVED',actor,locale),
  (locale:Locale)=>confirmationCard(row,'REJECTED',actor,locale),
  (locale:Locale)=>statusCard({...row,status:'APPROVED'},locale),
  (locale:Locale)=>statusCard({...row,status:'REJECTED'},locale),
  (locale:Locale)=>withdrawalCard(withdrawal,locale),
  (locale:Locale)=>withdrawalStatusCard({...withdrawal,status:'TRANSFERRED'},locale),
  (locale:Locale)=>withdrawalStatusCard({...withdrawal,status:'REJECTED'},locale),
 ];
 for(const factory of factories){
  const cards=locales.map(locale=>factory(locale) as {type:string});
  for(const card of cards){assert.equal(card.type,'flex');assert.doesNotMatch(allText(card),/\{[a-zA-Z][a-zA-Z0-9_]*\}/);assert.ok(allText(card).includes('PAIR LIVE'))}
  assert.deepEqual(stripText(cards[1]),stripText(cards[0]));
  assert.deepEqual(stripText(cards[2]),stripText(cards[0]));
 }
 for(const locale of locales){
  const request=allText(requestCard(row,undefined,false,false,locale));
  const confirm=allText(confirmationCard(row,'APPROVED',actor,locale));
  const withdraw=allText(withdrawalCard(withdrawal,locale));
  assert.ok(request.includes(id));assert.ok(confirm.includes(id));assert.ok(withdraw.includes(id));
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

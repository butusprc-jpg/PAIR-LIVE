import test from 'node:test';
import assert from 'node:assert/strict';
import {liveStartCard,countdownStartCard} from '../lib/line/start-cards';
import {resultNoticeText,resultNoticeCard} from '../lib/line/game-notices';
import {recipientLocale} from '../lib/line/locale';
import {t} from '../lib/i18n';
import type {Locale} from '../lib/i18n';

const result={roundId:'125',resultNumber:'5.8756',chosenSide:'even' as const,stakePoints:100,outcome:'CORRECT' as const,creditedPoints:190};
test('per-recipient templates use Thai, Chinese and English without changing numbers',()=>{
 process.env.NEXT_PUBLIC_APP_BASE_URL='https://example.test';
 for(const locale of ['th','zh-CN','en'] as Locale[]){
  const live=JSON.stringify(liveStartCard('QA Shop',locale));
  const countdown=JSON.stringify(countdownStartCard('125',60,locale));
  const text=resultNoticeText(result,locale);
  const card=JSON.stringify(resultNoticeCard(result,locale));
  assert.match(live,/QA Shop/);assert.match(countdown,/125/);assert.match(countdown,/60/);
  for(const value of ['125','5.8756','100','190']){assert.ok(text.includes(value));assert.ok(card.includes(value))}
  assert.ok(text.includes(t('line.result.title',locale)));
  assert.ok(live.includes(t('line.live.title',locale)));
  assert.ok(countdown.includes(t('line.countdown.title',locale)));
 }
 assert.match(resultNoticeText(result,'zh-CN'),/积分/);
 assert.match(resultNoticeText(result,'en'),/Points/);
 assert.match(resultNoticeText(result,'th'),/แต้ม/);
});
test('missing or invalid stored language falls back to Thai',()=>{
 assert.equal(recipientLocale(null),'th');assert.equal(recipientLocale('garbage'),'th');
 assert.equal(recipientLocale('zh-CN'),'zh-CN');assert.equal(recipientLocale('en'),'en');
 assert.equal(resultNoticeText(result,recipientLocale(undefined)),resultNoticeText(result,'th'));
});
test('result message still rejects mismatched outcomes',()=>{
 assert.throws(()=>resultNoticeText({...result,chosenSide:'odd'},'en'),/result_outcome_mismatch/);
});

test('WeChat Chinese templates render only, without a sender',async()=>{
 const {wechatLiveStartText,wechatCountdownText,wechatResultText}=await import('../lib/wechat/notice-templates');
 assert.match(wechatLiveStartText('QA Shop'),/直播已开始/);
 assert.match(wechatCountdownText('125',60),/125[\s\S]*60/);
 assert.match(wechatResultText(result),/5\.8756[\s\S]*积分/);
});

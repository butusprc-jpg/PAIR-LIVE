import test from 'node:test';
import assert from 'node:assert/strict';
import {extractLastDisplayedDigit,determineParity} from '../lib/ocr/core';
import {resultParity,resultNoticeText} from '../lib/line/game-notices';
import {t,type Locale} from '../lib/i18n';
import {closingBroadcastText} from '../lib/line/round-broadcast';
import thai from '../locales/th.json';
import chinese from '../locales/zh-CN.json';
import english from '../locales/en.json';

const cases=[['5.8756','EVEN'],['5.8757','ODD'],['0.0000','EVEN'],['9.9999','ODD']] as const;
test('OCR, settlement parity, member history and LINE rendering agree on exact last digit',()=>{
 for(const [number,parity] of cases){
  const digit=number.at(-1)!;
  assert.equal(extractLastDisplayedDigit(number),digit);
  assert.equal(determineParity(digit),parity);
  assert.equal(resultParity(number),parity.toLowerCase());
  for(const locale of ['th','zh-CN','en'] as Locale[]){
   const side=t(parity==='EVEN'?'round.even':'round.odd',locale);
   const web=t('member.roundHistoryResult',locale,{number,digit,side});
   const line=resultNoticeText({roundId:'125',resultNumber:number,chosenSide:parity.toLowerCase() as 'even'|'odd',stakePoints:100,outcome:'CORRECT',creditedPoints:190},locale);
   assert.ok(web.includes(number));assert.ok(web.includes(digit));assert.ok(web.includes(side));
   assert.ok(line.includes(number));assert.ok(line.includes(t(parity==='EVEN'?'line.side.even':'line.side.odd',locale)));
   assert.doesNotMatch(web+line,/\{[a-zA-Z][a-zA-Z0-9_]*\}/);
  }
 }
});
test('all three catalogs have matching placeholders and no accidental Thai in Chinese or English',()=>{
 const catalogs=[thai,chinese,english] as Record<string,string>[];
 assert.deepEqual(Object.keys(thai).sort(),Object.keys(chinese).sort());assert.deepEqual(Object.keys(thai).sort(),Object.keys(english).sort());
 for(const key of Object.keys(thai)){
  const placeholders=(text:string)=>[...text.matchAll(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g)].map(x=>x[1]).sort();
  assert.deepEqual(placeholders(catalogs[1][key]),placeholders(catalogs[0][key]),`zh-CN: ${key}`);
  assert.deepEqual(placeholders(catalogs[2][key]),placeholders(catalogs[0][key]),`en: ${key}`);
  if(key!=='common.thai')for(const translated of [catalogs[1][key],catalogs[2][key]])assert.doesNotMatch(translated,/[ก-๙]/,key);
 }
});
test('OA broadcast stays Thai and has one shared message',()=>{
 assert.match(closingBroadcastText,/เหลือเวลาอีก 1 นาที/);
 assert.doesNotMatch(closingBroadcastText,/\{[a-zA-Z]+\}/);
});
test('Chinese points copy does not describe points as cash',()=>{
 assert.doesNotMatch(t('member.withdrawUnsupported','zh-CN'),/提现|现金/);
 assert.match(t('member.withdrawUnsupported','zh-CN'),/积分/);
 assert.match(t('admin.topup.approval','zh-CN'),/积分/);
});

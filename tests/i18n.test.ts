import test from 'node:test';
import assert from 'node:assert/strict';
import {createTranslator,formatDate,formatNumber,supportedLocales,t} from '../lib/i18n';
import thai from '../locales/th.json';
import chinese from '../locales/zh-CN.json';
import english from '../locales/en.json';

test('Thai, simplified Chinese, and English share translated keys',()=>{
 assert.deepEqual(supportedLocales,['th','zh-CN','en']);
 assert.equal(t('round.even','th'),'คู่');
 assert.equal(t('round.even','zh-CN'),'偶数');
 assert.equal(t('round.even','en'),'Even');
 assert.deepEqual(Object.keys(chinese).sort(),Object.keys(thai).sort());
 assert.deepEqual(Object.keys(english).sort(),Object.keys(thai).sort());
});
test('interpolates text and numeric values without changing newlines',()=>{
 assert.equal(t('round.current','en',{roundId:42}),'Round 42');
 assert.equal(t('ocr.confidence','th',{confidence:87.5}),'ความมั่นใจ 87.5%');
 assert.equal(t('auth.sessionExpired','zh-CN'),'会话已过期\n请重新登录');
 assert.equal(t('common.points','en'),'{points} points');
});
test('missing locale key falls back to Thai and an unknown key remains visible',()=>{
 const translate=createTranslator({th:{greeting:'สวัสดี'},'zh-CN':{},en:{}});
 assert.equal(translate('greeting','en'),'สวัสดี');
 assert.equal(translate('greeting','zh-CN'),'สวัสดี');
 assert.equal(t('missing.key','en'),'missing.key');
});
test('formats numbers and Bangkok dates according to locale',()=>{
 assert.equal(formatNumber(12345.6,'en'),new Intl.NumberFormat('en-US').format(12345.6));
 assert.equal(formatNumber(12345.6,'zh-CN'),new Intl.NumberFormat('zh-CN').format(12345.6));
 const date='2026-11-16T18:00:00Z';
 for(const locale of supportedLocales)assert.ok(formatDate(date,locale).length>0);
 assert.notEqual(formatDate(date,'en'),formatDate(date,'th'));
 assert.equal(formatDate(date,'en',{year:'numeric'}),'2026');
 assert.throws(()=>formatDate('invalid','en'),/invalid_date/);
});

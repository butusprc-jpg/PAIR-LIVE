import test from 'node:test';
import assert from 'node:assert/strict';
import thai from '../locales/th.json';
import chinese from '../locales/zh-CN.json';
import english from '../locales/en.json';
import {t} from '../lib/i18n';
import {memberError,memberSide} from '../lib/member-translation';

test('all member translation keys exist in three languages',()=>{
 const keys=Object.keys(thai).filter(key=>key.startsWith('member.'));
 assert.ok(keys.length>100);
 for(const catalog of [chinese,english])for(const key of keys){
  assert.ok(Object.hasOwn(catalog,key),`missing ${key}`);
  assert.ok(catalog[key as keyof typeof catalog],`empty ${key}`);
 }
});

test('member labels and point units switch without changing entry side values',()=>{
 assert.equal(memberSide('คู่','th'),'คู่');
 assert.equal(memberSide('คู่','zh-CN'),'偶数');
 assert.equal(memberSide('คี่','en'),'Odd');
 assert.equal(t('member.pointsUnit','th'),'แต้ม');
 assert.equal(t('member.pointsUnit','zh-CN'),'积分');
 assert.equal(t('member.pointsUnit','en'),'Points');
});

test('member validation errors translate while unknown server codes are hidden',()=>{
 assert.match(memberError('กรุณากรอกแต้มตั้งแต่ 10 ถึง 100 แต้ม','en'),/10 to 100 points/);
 assert.equal(memberError('แต้มไม่เพียงพอ','zh-CN'),t('wallet.insufficient','zh-CN'));
 assert.equal(memberError('internal_error_code','en'),t('member.error.generic','en'));
});

test('missing member translation falls back to Thai',()=>{
 assert.equal(t('member.liveTitle','th'),'ห้องถ่ายทอดสด');
 assert.equal(t('member.liveTitle','en'),'Live room');
});

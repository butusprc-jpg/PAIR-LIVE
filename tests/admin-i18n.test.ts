import test from 'node:test';
import assert from 'node:assert/strict';
import thai from '../locales/th.json';
import chinese from '../locales/zh-CN.json';
import english from '../locales/en.json';
import {t} from '../lib/i18n';
import {adminError,adminStatus} from '../lib/admin-display';

test('Admin and Owner catalogs contain matching translated labels',()=>{
 const keys=Object.keys(thai);
 assert.deepEqual(Object.keys(chinese).sort(),keys.slice().sort());
 assert.deepEqual(Object.keys(english).sort(),keys.slice().sort());
 for(const key of ['กล้องหลัก · VDO.Ninja','ควบคุมบริการ LINE OA','รายงานการอนุมัติ','admin.ocr.unverified','admin.round.refund']){
  assert.ok(Object.hasOwn(thai,key));
  assert.notEqual(t(key,'zh-CN'),key);
  assert.notEqual(t(key,'en'),key);
 }
});

test('status labels change language without altering API status values',()=>{
 assert.equal(adminStatus('ACTIVE','en'),'Active');
 assert.equal(adminStatus('PAUSED','zh-CN'),'已暂停');
 assert.equal(adminStatus('PENDING','th'),'รออนุมัติ');
 assert.equal(adminStatus('REVIEW_REQUIRED','en'),'Review required');
 assert.equal(adminStatus('PARTIAL','zh-CN'),'部分数据');
 assert.equal(adminStatus('unexpected','en'),'Unknown status');
});

test('known errors translate and internal error codes stay out of UI',()=>{
 assert.equal(adminError('บันทึกไม่สำเร็จ','en'),'Could not save');
 assert.equal(adminError('csrf_unavailable','zh-CN'),t('admin.error.generic','zh-CN'));
});

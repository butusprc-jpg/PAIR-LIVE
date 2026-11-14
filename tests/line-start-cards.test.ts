import test from 'node:test';
import assert from 'node:assert/strict';
import {liveStartCard,countdownStartCard} from '../lib/line/start-cards';

test('LIVE and Countdown result cards use the configured PLAY LIFF URL',()=>{
 const previous=process.env.NEXT_PUBLIC_LINE_LIFF_ID;
 try{process.env.NEXT_PUBLIC_LINE_LIFF_ID='2012365283-j7QSoLC2';
  const live=JSON.stringify(liveStartCard('PAIR LIVE'));
  assert.match(live,/เริ่มถ่ายทอดสดแล้ว/);assert.match(live,/สถานะ: LIVE/);assert.match(live,/เข้าชม LIVE/);assert.match(live,/https:\/\/liff.line.me\/2012365283-j7QSoLC2/);
  const countdown=JSON.stringify(countdownStartCard('42',60));
  assert.match(countdown,/เริ่มนับถอยหลังแล้ว/);assert.match(countdown,/รอบที่: 42/);assert.match(countdown,/60 วินาที/);assert.match(countdown,/เข้าสู่หน้า PLAY/);
  assert.doesNotMatch(countdown,/เหลือเวลาอีก 1 นาที/);
 }finally{if(previous===undefined)delete process.env.NEXT_PUBLIC_LINE_LIFF_ID;else process.env.NEXT_PUBLIC_LINE_LIFF_ID=previous}
});

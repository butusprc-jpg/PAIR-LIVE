import assert from 'node:assert/strict';
import {test} from 'node:test';
import {cameraStartedNotice,resultNoticeCard,resultNoticeText,resultParity} from '../lib/line/game-notices';

test('winner notice shows full scale and confirmed total credit',()=>{
 const notice={roundId:'125',resultNumber:'2.48',chosenSide:'even' as const,stakePoints:100,outcome:'CORRECT' as const,creditedPoints:190};
 assert.equal(resultParity('2.48'),'even');
 const text=resultNoticeText(notice);
 assert.match(text,/ผลออกรางวัล: 2.48 \(คู่\)/);
 assert.match(text,/จำนวนที่ทาย: 100 แต้ม/);
 assert.match(text,/รวมยอดทั้งหมด: 190 แต้ม/);
 assert.equal(resultNoticeCard(notice).type,'flex');
});
test('losing member never sees a payout amount',()=>{
 const text=resultNoticeText({roundId:'125',resultNumber:'2.48',chosenSide:'odd',stakePoints:100,outcome:'INCORRECT'});
 assert.match(text,/ทายผิด ❌/);
 assert.doesNotMatch(text,/รวมยอดทั้งหมด/);
});
test('rejects false win and payout that has not been committed',()=>{
 assert.throws(()=>resultNoticeText({roundId:'125',resultNumber:'2.48',chosenSide:'odd',stakePoints:100,outcome:'CORRECT',creditedPoints:190}),/result_outcome_mismatch/);
 assert.throws(()=>resultNoticeText({roundId:'125',resultNumber:'2.48',chosenSide:'even',stakePoints:100,outcome:'CORRECT'}),/unconfirmed_payout/);
});
test('live notice omits unconfigured camera name',()=>assert.match(cameraStartedNotice(),/เริ่มถ่ายทอดสดแล้ว/));

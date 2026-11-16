import test from 'node:test';
import assert from 'node:assert/strict';
import {RESULT_ANNOUNCEMENT_MS,visibleResultAnnouncement} from '../lib/rounds/result-announcement';

const at='2026-01-01T00:00:00.000Z';
for(const [number,digit] of [['5.8346','6'],['5.8343','3']])test(`confirmed OCR ${number} announces only digit ${digit} for ten seconds`,()=>{
 const item={roundId:'42',lastDigit:digit,confirmedAt:at,status:'CONFIRMED'};
 const start=Date.parse(at);
 assert.deepEqual(visibleResultAnnouncement(item,start),item);
 assert.deepEqual(visibleResultAnnouncement(item,start+6_000),item);
 assert.deepEqual(visibleResultAnnouncement(item,start+9_999),item);
 assert.equal(visibleResultAnnouncement(item,start+RESULT_ANNOUNCEMENT_MS),null);
 assert.equal(visibleResultAnnouncement(item,start+RESULT_ANNOUNCEMENT_MS+1),null);
});
test('polling and a late join never extend the server announcement window',()=>{
 const item={roundId:'42',lastDigit:'3',confirmedAt:at,status:'CONFIRMED'};
 const start=Date.parse(at);
 assert.equal(visibleResultAnnouncement(item,start+8_000)?.lastDigit,'3');
 assert.equal(visibleResultAnnouncement({...item},start+9_000)?.lastDigit,'3');
 assert.equal(visibleResultAnnouncement({...item},start+10_000),null);
});
test('unverified, cancelled, review and simulation results are never shown',()=>{
 const item={roundId:'42',lastDigit:'3',confirmedAt:at,status:'CONFIRMED'},now=Date.parse(at)+1;
 for(const status of ['REVIEW_REQUIRED','CANCELLED','READ_UNVERIFIED','SIMULATION',null])assert.equal(visibleResultAnnouncement({...item,status},now),null);
 for(const lastDigit of ['33','คี่','',null])assert.equal(visibleResultAnnouncement({...item,lastDigit},now),null);
 assert.equal(visibleResultAnnouncement({...item,confirmedAt:'invalid'},now),null);
});
test('digit overlays the existing VDO.Ninja iframe without changing its URL or adding parity text',async()=>{
 const {createElement}=await import('react');
 const {renderToStaticMarkup}=await import('react-dom/server');
 const {default:VdoViewer}=await import('../modules/external-live/client/VdoViewer');
 const url='https://vdo.ninja/?view=synthetic123';
 const html=renderToStaticMarkup(createElement(VdoViewer,{url,label:'กล้อง LIVE',minimal:true,overlayDigit:'3'}));
 assert.match(html,/src="https:\/\/vdo\.ninja\/\?view=synthetic123"/);
 assert.match(html,/class="live-result-overlay"[^>]*>3<\/div>/);
 assert.doesNotMatch(html,/คู่|คี่/);
 assert.equal((html.match(/<iframe/g)||[]).length,1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {detectNumberRegion} from '../lib/ocr/detect-number';
import {TesseractOcrAdapter} from '../lib/ocr/engine';
import {analyzeOneShotFrame,mayCapture,scanOneShotNumber} from '../lib/ocr/one-shot-scan';
import type {Frame} from '../lib/ocr/core';
import type {LiveFrameSource} from '../lib/ocr/live-frame-source';
const frame=async(name:string):Promise<Frame>=>({id:name,roundId:'0',source:'MOBILE_CAMERA',capturedAt:new Date().toISOString(),image:await readFile(`tests/fixtures/scale/${name}.png`),width:640,height:240,healthy:true});
for(const [number,digit,parity] of [['5.8756','6','EVEN'],['2.47','7','ODD'],['0.00','0','EVEN']] as const)test(`one-shot detection ${number}`,async()=>{
 const result=await analyzeOneShotFrame(await frame(number),new TesseractOcrAdapter());
 assert.equal(result.status,'LOCKED');if(result.status==='LOCKED'){assert.equal(result.text,number);assert.equal(result.lastDigit,digit);assert.equal(result.parity,parity);assert.ok(result.roi.width<640)}
});
test('multiple equal number groups require review',async()=>{
 const image=await sharp(Buffer.from('<svg width="640" height="300" xmlns="http://www.w3.org/2000/svg"><rect width="640" height="300" fill="white"/><text x="70" y="115" font-family="DejaVu Sans" font-size="75">5.8756</text><text x="90" y="255" font-family="DejaVu Sans" font-size="75">2.47</text></svg>')).png().toBuffer();
 const result=await detectNumberRegion({...(await frame('5.8756')),image,width:640,height:300});assert.deepEqual(result,{status:'REVIEW_REQUIRED',reason:'multiple_number_groups'});
});
test('blurred number is not trusted',async()=>{
 const f=await frame('5.8756');f.image=await sharp(f.image).blur(12).png().toBuffer();assert.equal((await analyzeOneShotFrame(f,new TesseractOcrAdapter())).status,'REVIEW_REQUIRED');
});
test('blank camera image has no number',async()=>{
 const f=await frame('5.8756');f.image=await sharp({create:{width:640,height:240,channels:3,background:'#ffffff'}}).png().toBuffer();
 assert.deepEqual(await detectNumberRegion(f),{status:'REVIEW_REQUIRED',reason:'number_not_found'});
});
test('detector and cropped OCR disagreement requires review',async()=>{
 const f=await frame('5.8756');
 const result=await analyzeOneShotFrame(f,new TesseractOcrAdapter(),async()=>({status:'FOUND',label:'5.8758',roi:{x:0,y:0,width:640,height:240}}));
 assert.equal(result.status,'REVIEW_REQUIRED');if(result.status==='REVIEW_REQUIRED')assert.equal(result.reason,'conflicting_ocr_results');
});
test('camera offline and early/stale frames cannot be used',async()=>{
 const closed=new Date(Date.now()-1000).toISOString();let calls=0;
 const source:LiveFrameSource={kind:'VDO_NINJA',async open(){calls++},async capture(){return frame('5.8756')},async close(){}};
 const camera={cameraId:'c',oaId:'o',siteId:'s',sourceKind:'VDO_NINJA' as const,streamId:'stream123',displayEnabled:true};
 assert.equal(mayCapture(closed,Date.now()),false);
 assert.equal((await scanOneShotNumber({roundId:'1',closedAt:closed,camera},source,new TesseractOcrAdapter())).status,'REVIEW_REQUIRED');assert.equal(calls,0);
 const old=await frame('5.8756');old.capturedAt=new Date(Date.now()-10000).toISOString();
 const stale:LiveFrameSource={...source,async capture(){return old}};
 assert.deepEqual(await scanOneShotNumber({roundId:'1',closedAt:new Date(Date.now()-5000).toISOString(),camera},stale,new TesseractOcrAdapter()),{status:'REVIEW_REQUIRED',reason:'stale_or_early_frame'});
 const offline:LiveFrameSource={...source,async capture(){throw Error('offline')}};
 assert.deepEqual(await scanOneShotNumber({roundId:'1',closedAt:new Date(Date.now()-5000).toISOString(),camera},offline,new TesseractOcrAdapter()),{status:'REVIEW_REQUIRED',reason:'camera_offline'});
});
test('saved ROI reads 5.8343 and ignores other numbers outside the ROI',async()=>{
 const image=await sharp(Buffer.from('<svg width="900" height="240" xmlns="http://www.w3.org/2000/svg"><rect width="900" height="240" fill="white"/><text x="30" y="160" font-family="DejaVu Sans" font-size="110" fill="black">5.8343</text><text x="665" y="160" font-family="DejaVu Sans" font-size="95" fill="black">99.99</text></svg>')).png().toBuffer();
 const f={...(await frame('5.8756')),image,width:900,height:240};
 const result=await analyzeOneShotFrame(f,new TesseractOcrAdapter(),async()=>{throw Error('full-frame detection must not run')},{x:0,y:0,width:6500,height:10000});
 assert.equal(result.status,'LOCKED');if(result.status==='LOCKED'){assert.equal(result.text,'5.8343');assert.equal(result.lastDigit,'3');assert.equal(result.parity,'ODD');assert.ok(result.roi.x+result.roi.width<665)}
});

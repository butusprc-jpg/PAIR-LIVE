import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {validateScaleDisplay,type Frame,type OcrAdapter,type OcrReading} from '../lib/ocr/core';
import {TesseractOcrAdapter} from '../lib/ocr/engine';
import {StableLiveNumberGate,scanStableLiveNumber,roiMotionPixels,type StableSample} from '../lib/ocr/stable-live-scan';
import type {LiveCamera,LiveFrameSource} from '../lib/ocr/live-frame-source';

const close='2026-11-14T00:00:00.000Z',camera:LiveCamera={cameraId:'camera',oaId:'oa',siteId:'site',sourceKind:'VDO_NINJA',streamId:'stream123',displayEnabled:true};
const paper=(text:string,n:number)=>`<svg width="800" height="240" xmlns="http://www.w3.org/2000/svg"><rect width="800" height="240" fill="white"/><text x="320" y="170" text-anchor="middle" font-family="DejaVu Sans" font-size="120" fill="black">${text}</text><rect x="700" y="${n%100}" width="20" height="20" fill="black"/></svg>`;
async function frame(text:string,n:number,at:number):Promise<Frame>{return {id:`frame-${n}`,roundId:'0',source:'MOBILE_CAMERA',capturedAt:new Date(at).toISOString(),image:await sharp(Buffer.from(paper(text,n))).png().toBuffer(),width:800,height:240,healthy:true,sourceFrameIndex:n}}
function sample(n:number,text='5.60',at=Date.parse(close)+n*500,quality={confidence:90,blurScore:20,glareFraction:.01},pixel=42):StableSample{
 const image=Buffer.from(`changing-background-${n}`);const f:Frame={id:`frame-${n}`,roundId:'1',source:'MOBILE_CAMERA',capturedAt:new Date(at).toISOString(),image,width:800,height:240,healthy:true,sourceFrameIndex:n};
 const reading:OcrReading={frame:f,rawText:text,normalizedText:text,crop:image,...quality};
 return {frameId:f.id,capturedAt:f.capturedAt,fullSha256:createHash('sha256').update(image).digest('hex'),roiPixels:Buffer.alloc(2048,pixel),reading,sourceFrameIndex:n};
}
test('3 seconds of new frames with a still ROI lock exactly once; trailing zero stays',()=>{
 const gate=new StableLiveNumberGate(close);for(let n=1;n<=6;n++)assert.equal(gate.add(sample(n)),null);
 const lock=gate.add(sample(7));assert.deepEqual([lock?.text,lock?.lastDigit,lock?.parity],['5.60','0','EVEN']);
 assert.equal(gate.add(sample(8,'3.27')),lock);
});
test('change at 2.9 seconds restarts the full window',()=>{
 const gate=new StableLiveNumberGate(close);for(let n=1;n<=6;n++)gate.add(sample(n,'5.60',Date.parse(close)+n*450));
 assert.equal(gate.add(sample(7,'3.27',Date.parse(close)+2900)),null);
 for(let n=8;n<=12;n++)assert.equal(gate.add(sample(n,'3.27',Date.parse(close)+2900+(n-7)*500)),null);
 assert.equal(gate.add(sample(13,'3.27',Date.parse(close)+5900))?.parity,'ODD');
});
test('stale camera, moving ROI, low confidence, blur and multiple numbers never lock',()=>{
 for(const change of [
  (s:StableSample)=>{s.fullSha256=createHash('sha256').update(Buffer.from('same')).digest('hex')},
  (s:StableSample,n:number)=>{s.roiPixels=Buffer.alloc(2048,n%2?180:42)},
  (s:StableSample)=>{s.reading.confidence=20},
  (s:StableSample)=>{s.reading.blurScore=0},
  (s:StableSample)=>{s.reading.normalizedText='5.60 3.27'},
 ]){const gate=new StableLiveNumberGate(close);for(let n=1;n<=8;n++){const s=sample(n);if(n>1)change(s,n);gate.add(s)}assert.equal(gate.lock,undefined)}
});
test('all supplied decimal strings preserve their rightmost digit',()=>{
 for(const [text,digit,parity] of [['2.48','8','EVEN'],['3.27','7','ODD'],['5.60','0','EVEN'],['7.13','3','ODD'],['8.99','9','ODD'],['10.42','2','EVEN'],['123.456','6','EVEN'],['100.001','1','ODD'],['25.0','0','EVEN'],['19','9','ODD']]){
  const gate=new StableLiveNumberGate(close);for(let n=1;n<=7;n++)gate.add(sample(n,text));assert.deepEqual([gate.lock?.lastDigit,gate.lock?.parity],[digit,parity]);
 }
});
test('scan refuses pre-close and mismatched OA before touching the source',async()=>{
 const source={kind:'VDO_NINJA' as const,async open(){throw Error('should_not_open')},async capture(){throw Error('unused')},async close(){}};
 await assert.rejects(scanStableLiveNumber({roundId:'1',status:'OPEN',closedAt:close,oaId:'oa',camera,roi:{x:0,y:0,width:8000,height:10000}},source,new TesseractOcrAdapter(),undefined,()=>Date.parse(close)+1000),/round_not_closed_for_ocr/);
 await assert.rejects(scanStableLiveNumber({roundId:'1',status:'SCANNING',closedAt:close,oaId:'other',camera,roi:{x:0,y:0,width:8000,height:10000}},source,new TesseractOcrAdapter(),undefined,()=>Date.parse(close)+1000),/ocr_camera_oa_or_roi_mismatch/);
});
test('camera frozen beyond wait window returns REVIEW_REQUIRED and closes source',async()=>{
 let clock=Date.parse(close)+100,closed=false,n=0;
 const frozen=await frame('5.60',1,clock);
 const source:LiveFrameSource={kind:'VDO_NINJA',async open(){},async capture(){clock+=500;n++;return {...frozen,id:`frame-${n}`,capturedAt:new Date(clock).toISOString(),sourceFrameIndex:n}},async close(){closed=true}};
 const engine:OcrAdapter={async read(f){return {frame:f,rawText:'5.60',normalizedText:'5.60',confidence:95,blurScore:10,glareFraction:0,crop:f.image}}};
 const result=await scanStableLiveNumber({roundId:'1',status:'SCANNING',closedAt:close,oaId:'oa',camera,roi:{x:0,y:0,width:8000,height:10000}},source,engine,{stableMs:3000,minimumFrames:5,maximumGapMs:1500,minimumGapMs:80,minimumConfidence:75,minimumBlurScore:1,maximumGlareFraction:.25,maximumRoiMotion:.04,maximumWaitMs:2600},()=>clock);
 assert.deepEqual(result,{status:'REVIEW_REQUIRED',reason:'stable_number_timeout'});assert.equal(closed,true);
});
test('real Tesseract reads synthetic moving video frames through LiveFrameSource and ROI',async()=>{
 let n=0,clock=Date.parse(close)+100,opens=0,closes=0;
 const source:LiveFrameSource={kind:'VDO_NINJA',async open(){opens++},async capture(){n++;clock+=500;return frame('5.60',n,clock)},async close(){closes++}};
 const result=await scanStableLiveNumber({roundId:'1',status:'SCANNING',closedAt:close,oaId:'oa',camera,roi:{x:0,y:0,width:8000,height:10000}},source,new TesseractOcrAdapter(),undefined,()=>clock);
 assert.equal(result.status,'LOCKED');if(result.status==='LOCKED')assert.deepEqual([result.lock.text,result.lock.lastDigit,result.lock.parity],['5.60','0','EVEN']);
 assert.deepEqual([opens,closes],[1,1]);
});
test('ROI pixel reduction reports unchanged paper despite movement outside ROI',async()=>{
 const a=await frame('3.27',1,Date.parse(close)+100),b=await frame('3.27',2,Date.parse(close)+600),engine:OcrAdapter=new TesseractOcrAdapter();
 const ra=await engine.read(a,{x:0,y:0,width:640,height:240}),rb=await engine.read(b,{x:0,y:0,width:640,height:240});
 assert.equal(ra.normalizedText,'3.27');assert.equal(rb.normalizedText,'3.27');
 assert.deepEqual(await roiMotionPixels(ra.crop),await roiMotionPixels(rb.crop));
});
test('real Tesseract output with two number groups is rejected',async()=>{
 const image=await sharp(Buffer.from(`<svg width="900" height="240" xmlns="http://www.w3.org/2000/svg"><rect width="900" height="240" fill="white"/><text x="450" y="170" text-anchor="middle" font-family="DejaVu Sans" font-size="100" fill="black">5.60 3.27</text></svg>`)).png().toBuffer();
 const f:Frame={id:'two',roundId:'1',source:'MOBILE_CAMERA',capturedAt:new Date().toISOString(),image,width:900,height:240,healthy:true};
 const reading=await new TesseractOcrAdapter().read(f,{x:0,y:0,width:900,height:240});
 assert.throws(()=>validateScaleDisplay(reading.normalizedText),/ambiguous_scale_display/);
});

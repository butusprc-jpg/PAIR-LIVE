import {createHash} from 'node:crypto';
import sharp from 'sharp';
import type {OcrAdapter,OcrReading,Parity} from './core';
import {determineParity,extractLastDisplayedDigit,validateScaleDisplay} from './core';
import type {LiveCamera,LiveFrameSource,NormalizedRoi} from './live-frame-source';
import {roiForFrame,validNormalizedRoi} from './live-frame-source';

export type StableLock={text:string;lastDigit:string;parity:Parity;confidence:number;firstCapturedAt:string;lastCapturedAt:string;frameIds:string[];lastFrameSha256:string};
export type ScanOutcome={status:'LOCKED';lock:StableLock}|{status:'REVIEW_REQUIRED';reason:string};
export type StableSample={frameId:string;capturedAt:string;fullSha256:string;roiPixels:Buffer;reading:OcrReading;sourceFrameIndex?:number};
export type StableConfig={stableMs:number;minimumFrames:number;maximumGapMs:number;minimumGapMs:number;minimumConfidence:number;minimumBlurScore:number;maximumGlareFraction:number;maximumRoiMotion:number;maximumWaitMs:number};
export const defaultStableConfig:StableConfig={stableMs:3000,minimumFrames:5,maximumGapMs:1500,minimumGapMs:80,minimumConfidence:75,minimumBlurScore:1,maximumGlareFraction:.25,maximumRoiMotion:.04,maximumWaitMs:15000};

function roiMotion(a:Buffer,b:Buffer){if(a.length!==b.length||!a.length)return Infinity;let sum=0;for(let i=0;i<a.length;i++)sum+=Math.abs(a[i]-b[i]);return sum/(a.length*255)}
export async function roiMotionPixels(crop:Buffer){return sharp(crop,{limitInputPixels:2_000_000}).resize(64,32,{fit:'fill'}).greyscale().raw().toBuffer()}

/** Pure stability gate. A lock is a candidate, never a settlement decision. */
export class StableLiveNumberGate{
 private candidate?:{text:string;firstAt:number;lastAt:number;lastHash:string;lastPixels:Buffer;lastIndex?:number;ids:string[];minimumConfidence:number};
 private locked?:StableLock;
 private lastSeenAt=-Infinity;
 private lastSeenId='';
 constructor(private closedAt:string,private config:StableConfig=defaultStableConfig){if(!Number.isFinite(Date.parse(closedAt)))throw new Error('invalid_round_close_time')}
 get lock(){return this.locked}
 reset(){this.candidate=undefined}
 add(sample:StableSample):StableLock|null{
  if(this.locked)return this.locked;
  const at=Date.parse(sample.capturedAt),closed=Date.parse(this.closedAt),r=sample.reading;
  if(!Number.isFinite(at)||at<closed||!sample.frameId||sample.frameId===this.lastSeenId||at<=this.lastSeenAt||at-this.lastSeenAt<this.config.minimumGapMs||!r.frame.healthy){this.reset();return null}
  this.lastSeenAt=at;this.lastSeenId=sample.frameId;
  if(!/^[0-9a-f]{64}$/.test(sample.fullSha256)||sample.roiPixels.length!==2048||r.confidence<this.config.minimumConfidence||r.blurScore<this.config.minimumBlurScore||r.glareFraction>this.config.maximumGlareFraction){this.reset();return null}
  let text:string;try{text=validateScaleDisplay(r.normalizedText)}catch{this.reset();return null}
  const old=this.candidate;
  if(!old||old.text!==text||at-old.lastAt>this.config.maximumGapMs||old.lastHash===sample.fullSha256||old.lastIndex!==undefined&&sample.sourceFrameIndex!==undefined&&sample.sourceFrameIndex<=old.lastIndex||roiMotion(old.lastPixels,sample.roiPixels)>this.config.maximumRoiMotion){
   this.candidate={text,firstAt:at,lastAt:at,lastHash:sample.fullSha256,lastPixels:sample.roiPixels,lastIndex:sample.sourceFrameIndex,ids:[sample.frameId],minimumConfidence:r.confidence};return null;
  }
  old.lastAt=at;old.lastHash=sample.fullSha256;old.lastPixels=sample.roiPixels;old.lastIndex=sample.sourceFrameIndex;old.ids.push(sample.frameId);old.minimumConfidence=Math.min(old.minimumConfidence,r.confidence);
  if(at-old.firstAt>=this.config.stableMs&&old.ids.length>=this.config.minimumFrames){const lastDigit=extractLastDisplayedDigit(text);this.locked={text,lastDigit,parity:determineParity(lastDigit),confidence:old.minimumConfidence,firstCapturedAt:new Date(old.firstAt).toISOString(),lastCapturedAt:sample.capturedAt,frameIds:[...old.ids],lastFrameSha256:sample.fullSha256}}
  return this.locked??null;
 }
}

/** One source and one ROI for the whole scan; no browser-supplied OCR text. */
export async function scanStableLiveNumber(input:{roundId:string;status:string;closedAt:string;oaId:string;camera:LiveCamera;roi:NormalizedRoi},source:LiveFrameSource,engine:OcrAdapter,config:StableConfig=defaultStableConfig,now=()=>Date.now()):Promise<ScanOutcome>{
 if(!/^\d+$/.test(input.roundId)||input.status!=='SCANNING'||Date.parse(input.closedAt)>now()||!Number.isFinite(Date.parse(input.closedAt)))throw new Error('round_not_closed_for_ocr');
 if(input.camera.oaId!==input.oaId||source.kind!==input.camera.sourceKind||!input.camera.displayEnabled||!validNormalizedRoi(input.roi))throw new Error('ocr_camera_oa_or_roi_mismatch');
 const gate=new StableLiveNumberGate(input.closedAt,config),deadline=now()+config.maximumWaitMs;
 await source.open(input.camera);
 try{
  while(now()<deadline){
   let frame;
   try{frame=await source.capture()}catch{return {status:'REVIEW_REQUIRED',reason:'source_offline_or_stale'}}
   const age=now()-Date.parse(frame.capturedAt);
   if(!frame.healthy||frame.image.length>5*1024*1024||frame.width*frame.height>2_000_000||!Number.isFinite(age)||age<0||age>2000||Date.parse(frame.capturedAt)<Date.parse(input.closedAt))return {status:'REVIEW_REQUIRED',reason:'invalid_or_early_frame'};
   const boundFrame={...frame,roundId:input.roundId};
   let reading:OcrReading;try{reading=await engine.read(boundFrame,roiForFrame(input.roi,frame))}catch{gate.reset();continue}
   if(now()>deadline)break;
   let pixels:Buffer;try{pixels=await roiMotionPixels(reading.crop)}catch{gate.reset();continue}
   const locked=gate.add({frameId:frame.id,capturedAt:frame.capturedAt,fullSha256:createHash('sha256').update(frame.image).digest('hex'),roiPixels:pixels,reading,sourceFrameIndex:frame.sourceFrameIndex});
   if(locked)return {status:'LOCKED',lock:locked};
  }
  return {status:'REVIEW_REQUIRED',reason:'stable_number_timeout'};
 }finally{await source.close()}
}

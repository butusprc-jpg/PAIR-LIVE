import type {Frame, OcrAdapter, OcrReading, Parity} from './core';
import {determineParity,extractLastDisplayedDigit,validateScaleDisplay} from './core';
import type {LiveCamera,LiveFrameSource,NormalizedRoi} from './live-frame-source';
import {roiForFrame,validNormalizedRoi} from './live-frame-source';
import {detectNumberRegion,type Detection} from './detect-number';

export type OneShotOutcome={status:'LOCKED';text:string;lastDigit:string;parity:Parity;confidence:number;reading:OcrReading;roi:Extract<Detection,{status:'FOUND'}>['roi']}|{status:'REVIEW_REQUIRED';reason:string;frame?:Frame;roi?:Extract<Detection,{status:'FOUND'}>['roi'];rawText?:string;confidence?:number};
export const readyAt=(closedAt:string)=>Date.parse(closedAt)+3000;
export function mayCapture(closedAt:string,now:number){return Number.isFinite(readyAt(closedAt))&&now>=readyAt(closedAt)}
export async function analyzeOneShotFrame(frame:Frame,engine:OcrAdapter,detector=detectNumberRegion,savedRoi?:NormalizedRoi):Promise<OneShotOutcome>{
 if(!frame.healthy||frame.image.length<24||frame.image.length>5*1024*1024||frame.width*frame.height>2_000_000)return {status:'REVIEW_REQUIRED',reason:'invalid_frame'};
 if(savedRoi&&!validNormalizedRoi(savedRoi))return {status:'REVIEW_REQUIRED',reason:'invalid_saved_roi',frame};
 const detected=savedRoi?{status:'FOUND' as const,roi:roiForFrame(savedRoi,frame),label:''}:await detector(frame);if(detected.status!=='FOUND')return {...detected,frame};
 let reading:OcrReading;try{reading=await engine.read(frame,detected.roi)}catch{return {status:'REVIEW_REQUIRED',reason:'ocr_failed',frame,roi:detected.roi}}
 const review=(reason:string):OneShotOutcome=>({status:'REVIEW_REQUIRED',reason,frame,roi:detected.roi,rawText:reading.rawText,confidence:reading.confidence});
 if(reading.conflict)return review('conflicting_ocr_results');
 let text:string;try{text=validateScaleDisplay(reading.normalizedText)}catch{return review('ambiguous_display')}
 if(!savedRoi&&text!==detected.label)return review('conflicting_ocr_results');
 if(reading.confidence<75)return review('low_confidence');
 if(reading.blurScore<1)return review('blurry_image');
 const lastDigit=extractLastDisplayedDigit(text);
 return {status:'LOCKED',text,lastDigit,parity:determineParity(lastDigit),confidence:reading.confidence,reading,roi:detected.roi};
}
export async function scanOneShotNumber(input:{roundId:string;closedAt:string;camera:LiveCamera;roi?:NormalizedRoi},source:LiveFrameSource,engine:OcrAdapter,now=()=>Date.now(),onTiming?:(stage:'capture_start_lag'|'capture'|'ocr',durationMs:number)=>void):Promise<OneShotOutcome>{
 const startedAt=now();if(!/^\d+$/.test(input.roundId)||!mayCapture(input.closedAt,startedAt))return {status:'REVIEW_REQUIRED',reason:'before_three_seconds'};
 onTiming?.('capture_start_lag',startedAt-readyAt(input.closedAt));
 let frame:Frame;const captureStart=performance.now();
 try{
  await source.open(input.camera);frame=await source.capture();
 }catch{return {status:'REVIEW_REQUIRED',reason:'camera_offline'}}finally{await source.close();onTiming?.('capture',performance.now()-captureStart)}
 const captured=Date.parse(frame.capturedAt);
 if(!Number.isFinite(captured)||captured<readyAt(input.closedAt)||captured>now()+1000||now()-captured>2000)return {status:'REVIEW_REQUIRED',reason:'stale_or_early_frame'};
 const ocrStart=performance.now();const result=await analyzeOneShotFrame({...frame,roundId:input.roundId},engine,detectNumberRegion,input.roi);onTiming?.('ocr',performance.now()-ocrStart);return result;
}

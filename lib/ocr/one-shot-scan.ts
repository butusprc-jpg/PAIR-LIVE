import type {Frame, OcrAdapter, OcrReading, Parity} from './core';
import {determineParity,extractLastDisplayedDigit,validateScaleDisplay} from './core';
import type {LiveCamera,LiveFrameSource} from './live-frame-source';
import {detectNumberRegion,type Detection} from './detect-number';

export type OneShotOutcome={status:'LOCKED';text:string;lastDigit:string;parity:Parity;confidence:number;reading:OcrReading;roi:Extract<Detection,{status:'FOUND'}>['roi']}|{status:'REVIEW_REQUIRED';reason:string;frame?:Frame;roi?:Extract<Detection,{status:'FOUND'}>['roi'];rawText?:string;confidence?:number};
export const readyAt=(closedAt:string)=>Date.parse(closedAt)+3000;
export function mayCapture(closedAt:string,now:number){return Number.isFinite(readyAt(closedAt))&&now>=readyAt(closedAt)}
export async function analyzeOneShotFrame(frame:Frame,engine:OcrAdapter,detector=detectNumberRegion):Promise<OneShotOutcome>{
 if(!frame.healthy||frame.image.length<24||frame.image.length>5*1024*1024||frame.width*frame.height>2_000_000)return {status:'REVIEW_REQUIRED',reason:'invalid_frame'};
 const detected=await detector(frame);if(detected.status!=='FOUND')return {...detected,frame};
 let reading:OcrReading;try{reading=await engine.read(frame,detected.roi)}catch{return {status:'REVIEW_REQUIRED',reason:'ocr_failed',frame,roi:detected.roi}}
 const review=(reason:string):OneShotOutcome=>({status:'REVIEW_REQUIRED',reason,frame,roi:detected.roi,rawText:reading.rawText,confidence:reading.confidence});
 if(reading.conflict)return review('conflicting_ocr_results');
 let text:string;try{text=validateScaleDisplay(reading.normalizedText)}catch{return review('ambiguous_display')}
 if(text!==detected.label)return review('conflicting_ocr_results');
 if(reading.confidence<75)return review('low_confidence');
 if(reading.blurScore<1)return review('blurry_image');
 const lastDigit=extractLastDisplayedDigit(text);
 return {status:'LOCKED',text,lastDigit,parity:determineParity(lastDigit),confidence:reading.confidence,reading,roi:detected.roi};
}
export async function scanOneShotNumber(input:{roundId:string;closedAt:string;camera:LiveCamera},source:LiveFrameSource,engine:OcrAdapter,now=()=>Date.now()):Promise<OneShotOutcome>{
 if(!/^\d+$/.test(input.roundId)||!mayCapture(input.closedAt,now()))return {status:'REVIEW_REQUIRED',reason:'before_three_seconds'};
 let frame:Frame;
 try{
  await source.open(input.camera);frame=await source.capture();
 }catch{return {status:'REVIEW_REQUIRED',reason:'camera_offline'}}finally{await source.close()}
 const captured=Date.parse(frame.capturedAt);
 if(!Number.isFinite(captured)||captured<readyAt(input.closedAt)||captured>now()+1000||now()-captured>2000)return {status:'REVIEW_REQUIRED',reason:'stale_or_early_frame'};
 return analyzeOneShotFrame({...frame,roundId:input.roundId},engine);
}

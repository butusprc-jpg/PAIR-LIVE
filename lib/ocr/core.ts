import {createHash} from 'node:crypto';
export type Parity='EVEN'|'ODD';
export type SourceType='MOBILE_CAMERA'|'IP_CAMERA'|'NVR_DVR'|'CLOUD_CAMERA';
export type Frame={id:string;roundId:string;source:SourceType;capturedAt:string;image:Buffer;width:number;height:number;healthy:boolean;sourceFrameIndex?:number};
export interface FrameSource {type:SourceType; capture(roundId:string):Promise<Frame>}
export type OcrReading={frame:Frame;rawText:string;normalizedText:string;confidence:number;blurScore:number;glareFraction:number;crop:Buffer};
export interface OcrAdapter {read(frame:Frame,roi:Roi):Promise<OcrReading>}
export type Roi={x:number;y:number;width:number;height:number};
export type OcrConfig={sampleCount:number;minimumConfidence:number;minimumBlurScore:number;maximumGlareFraction:number;maximumFrameAgeMs:number;minimumFrameGapMs:number};
export const defaultOcrConfig:OcrConfig={sampleCount:5,minimumConfidence:75,minimumBlurScore:1,maximumGlareFraction:.25,maximumFrameAgeMs:4000,minimumFrameGapMs:100};
export function validateScaleDisplay(text:string){const normalized=text.trim();if(!/^\d+(?:\.\d+)?$/.test(normalized))throw new Error('ambiguous_scale_display');return normalized}
export function extractLastDisplayedDigit(text:string){const value=validateScaleDisplay(text);const match=value.match(/(\d)$/);if(!match)throw new Error('missing_last_digit');return match[1]}
export function determineParity(digit:string):Parity{if(!/^\d$/.test(digit))throw new Error('invalid_digit');return Number(digit)%2?'ODD':'EVEN'}
export type Verification={status:'VERIFIED';fullDisplayText:string;lastDigit:string;parity:Parity;confidence:number;verifiedAt:string;readings:OcrReading[]} | {status:'REVIEW_REQUIRED';reason:string;readings:OcrReading[]};
export function verifyReadings(readings:OcrReading[],now:string,config:OcrConfig=defaultOcrConfig):Verification{
 const review=(reason:string):Verification=>({status:'REVIEW_REQUIRED',reason,readings});
 if(readings.length<config.sampleCount)return review('insufficient_frames');
 const selected=readings.slice(0,config.sampleCount);let expected:string|undefined,previous=-Infinity;const ids=new Set<string>();const images=new Set<string>();
 for(const item of selected){const {frame}=item;const at=Date.parse(frame.capturedAt);if(!frame.healthy)return review('source_offline');if(!Number.isFinite(at)||at> Date.parse(now)+1000||Date.parse(now)-at>config.maximumFrameAgeMs)return review('stale_frame');if(at-previous<config.minimumFrameGapMs)return review('frames_not_fresh');previous=at;
  if(ids.has(frame.id))return review('duplicate_frame');ids.add(frame.id);
  const digest=createHash('sha256').update(frame.image).digest('hex');if(images.has(digest))return review('frozen_image');images.add(digest);
  if(item.blurScore<config.minimumBlurScore)return review('blurry_image');if(item.glareFraction>config.maximumGlareFraction)return review('glare');if(item.confidence<config.minimumConfidence)return review('low_confidence');
  let normalized:string;try{normalized=validateScaleDisplay(item.normalizedText)}catch{return review('ambiguous_scale_display')}
  if(expected!==undefined&&normalized!==expected)return review('unstable_display');expected=normalized;
 }
 const fullDisplayText=expected!;const lastDigit=extractLastDisplayedDigit(fullDisplayText);return {status:'VERIFIED',fullDisplayText,lastDigit,parity:determineParity(lastDigit),confidence:Math.min(...selected.map(x=>x.confidence)),verifiedAt:now,readings:selected};
}

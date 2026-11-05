import {determineParity,extractLastDisplayedDigit,validateScaleDisplay} from './core';
import type {Parity,Roi} from './core';

export type AutoOcrState='SEARCHING'|'TRACKING'|'STABILIZING'|'LOCKED'|'REVIEW_REQUIRED';
export type AutoOcrSample={frameId:string;capturedAt:number;text:string;confidence:number;box:Roi};
export type AutoOcrLock={text:string;lastDigit:string;parity:Parity;box:Roi;lockedAt:number;frameIds:string[]};
export type AutoOcrResult={state:AutoOcrState;box?:Roi;text?:string;lock?:AutoOcrLock;reason?:string};

/** Preview-only stability gate. Its result is never trusted settlement evidence. */
export class AutoOcrStability {
 private state:AutoOcrState='SEARCHING';
 private candidate?:{text:string;box:Roi;since:number;lastAt:number;ids:Set<string>};
 private lock?:AutoOcrLock;
 constructor(private readonly stableMs=2000,private readonly minimumFrames=5,private readonly minimumConfidence=75){}
 get result():AutoOcrResult{return {state:this.state,box:this.lock?.box??this.candidate?.box,text:this.lock?.text??this.candidate?.text,lock:this.lock}}
 reset(){this.state='SEARCHING';this.candidate=undefined;this.lock=undefined}
 missing(){if(this.state==='LOCKED')return this.result;this.reset();return this.result}
 add(sample:AutoOcrSample):AutoOcrResult{
  if(this.state==='LOCKED')return this.result;
  const {box}=sample;
  if(!sample.frameId||!Number.isFinite(sample.capturedAt)||!Number.isFinite(sample.confidence)||!Number.isFinite(box.x)||!Number.isFinite(box.y)||!Number.isFinite(box.width)||!Number.isFinite(box.height)||box.width<=0||box.height<=0||box.x<0||box.y<0){this.reset();return this.result}
  let text:string;
  try{text=validateScaleDisplay(sample.text)}catch{this.state='REVIEW_REQUIRED';this.candidate=undefined;return {state:this.state,reason:'ambiguous_display'}}
  if(sample.confidence<this.minimumConfidence){this.state='REVIEW_REQUIRED';this.candidate=undefined;return {state:this.state,reason:'low_confidence'}}
  const old=this.candidate;
  if(old&&(!sample.frameId||old.ids.has(sample.frameId)||sample.capturedAt<=old.lastAt)){this.state='REVIEW_REQUIRED';this.candidate=undefined;return {state:this.state,reason:'duplicate_or_old_frame'}}
  if(old){
   const centerDistance=Math.hypot(box.x+box.width/2-old.box.x-old.box.width/2,box.y+box.height/2-old.box.y-old.box.height/2);
   const size=Math.hypot(old.box.width,old.box.height);
   if(centerDistance>size*.25){this.reset();return this.result}
  }
  if(!old||old.text!==text){this.candidate={text,box,since:sample.capturedAt,lastAt:sample.capturedAt,ids:new Set([sample.frameId])};this.state='TRACKING';return this.result}
  old.box=box;old.lastAt=sample.capturedAt;old.ids.add(sample.frameId);
  this.state='STABILIZING';
  if(sample.capturedAt-old.since>=this.stableMs&&old.ids.size>=this.minimumFrames){
   const lastDigit=extractLastDisplayedDigit(text);
   this.lock={text,lastDigit,parity:determineParity(lastDigit),box,lockedAt:sample.capturedAt,frameIds:[...old.ids]};
   this.state='LOCKED';
  }
  return this.result;
 }
}

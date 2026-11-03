import type {RoundStatus} from '../rounds/core';
import type {FrameSource,OcrAdapter,OcrConfig,Roi,Verification} from './core';
import {verifyReadings,defaultOcrConfig} from './core';
export type OcrEvent={type:'ROUND_SETTLED'|'OCR_REVIEW_REQUIRED'|'WORKER_ERROR';roundId:string;occurredAt:string;details:Record<string,unknown>};
export interface EventSink {emit(event:OcrEvent):Promise<void>}
export async function scanRound(round:{id:string;status:RoundStatus;closesAt:string},source:FrameSource,engine:OcrAdapter,roi:Roi,config:OcrConfig=defaultOcrConfig,now=()=>new Date()):Promise<Verification>{
 if(round.status!=='SCANNING'||now().getTime()<Date.parse(round.closesAt))throw new Error('round_not_scanning');
 const readings=[];for(let i=0;i<config.sampleCount;i++){const frame=await source.capture(round.id);if(frame.roundId!==round.id)throw new Error('wrong_round_frame');readings.push(await engine.read(frame,roi))}
 return verifyReadings(readings,now().toISOString(),config);
}
export function canCommitOcrResult(status:RoundStatus,verification:Verification){return status==='SCANNING'&&verification.status==='VERIFIED'}

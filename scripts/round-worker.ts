import {tickRoundEngine} from '../lib/rounds/store';
import {database} from '../lib/server/db';
import {dispatchClosingBroadcast} from '../lib/line/round-broadcast';
import {dispatchCountdownLine} from '../lib/line/countdown-notify';
import {dispatchLiveStartLine} from '../lib/line/live-start-notify';
import {dispatchRoundResultLine} from '../lib/line/round-result-notify';
import {singleOaReady} from '../lib/server/single-oa';
import {lockRoundOcrCandidate,reviewOcrScanFailure} from '../lib/ocr/round-candidate';
import {VdoLiveFrameSource} from '../lib/ocr/vdo-live-frame-source';
import {TesseractOcrAdapter} from '../lib/ocr/engine';
import {reviewMissingOcrEvidence,settleOcrCandidate} from '../lib/ocr/automatic-settlement';
import {configuredCandidateImageStorage} from '../lib/ocr/candidate-image-storage';
import {createWorkerLinePump} from '../lib/line/worker-pump';
async function main(){
 if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required');
 if(process.env.RAILWAY_STAGING_NO_LINE==='true')throw new Error('round_worker_staging_gate_closed');
 if(process.env.RAILWAY_SINGLE_OA_MODE==='true'&&!await singleOaReady(database()))throw new Error('single_oa_binding_invalid');
 let running=true,scanActive=false,lastCandidateRoundId:string|null=null;process.on('SIGTERM',()=>{running=false});process.on('SIGINT',()=>{running=false});
 const linePump=createWorkerLinePump([
  {name:'broadcast',dispatch:()=>dispatchClosingBroadcast()},
  {name:'countdown',dispatch:()=>dispatchCountdownLine()},
  {name:'live_start',dispatch:()=>dispatchLiveStartLine()},
  {name:'result',dispatch:()=>process.env.OCR_AUTO_SETTLEMENT_ENABLED==='true'?Promise.resolve(null):dispatchRoundResultLine()}
 ],metric=>console.log(JSON.stringify({kind:'worker_line_timing',...metric,durationMs:Math.round(metric.durationMs)})));
 while(running){try{const tickStart=performance.now();if(process.env.RAILWAY_SINGLE_OA_MODE==='true'&&!await singleOaReady(database()))throw new Error('single_oa_binding_invalid');const state=await tickRoundEngine({allowAutoStart:false});
  if(process.env.OCR_CANDIDATE_SCAN_ENABLED==='true'&&state.round?.status==='SCANNING'&&!scanActive&&state.round.id!==lastCandidateRoundId){const roundId=state.round.id,scanStart=performance.now(),dueLagMs=state.round.closedAt?Date.now()-Date.parse(state.round.closedAt)-3000:null;scanActive=true;void lockRoundOcrCandidate(database(),roundId,{VDO_NINJA:()=>new VdoLiveFrameSource()},new TesseractOcrAdapter(),undefined,(stage,durationMs)=>console.log(JSON.stringify({kind:'ocr_stage_timing',roundId,stage,durationMs:Math.round(durationMs)}))).then(async result=>{
   if(result.status!=='WAITING')console.log(JSON.stringify({kind:'ocr_scan_timing',roundId,status:result.status,replayed:result.status==='LOCKED'?result.replayed:undefined,dueLagMs,scanMs:Math.round(performance.now()-scanStart)}));
   if(result.status==='LOCKED'&&process.env.OCR_AUTO_SETTLEMENT_ENABLED==='true'){
    const storage=configuredCandidateImageStorage();if(!storage)throw new Error('candidate_storage_not_configured');
    const settled=await settleOcrCandidate(database(),roundId,storage);console.log(JSON.stringify({roundId,ocrSettlement:settled.status,replayed:settled.replayed}));
   }
   if(result.status!=='WAITING')lastCandidateRoundId=roundId;
  }).catch(async error=>{const code=error instanceof Error?error.message:'';if(process.env.OCR_AUTO_SETTLEMENT_ENABLED==='true'&&['candidate_image_missing','candidate_image_integrity_failed','candidate_storage_not_configured'].includes(code))await reviewMissingOcrEvidence(database(),roundId,code).catch(()=>{});else if(await reviewOcrScanFailure(database(),roundId,'ocr_scan_failed').catch(()=>false))lastCandidateRoundId=roundId;console.error(JSON.stringify({status:'ERROR',errorCode:'ocr_candidate_or_settlement_failed'}))}).finally(()=>{scanActive=false})}
  const lineScheduled=linePump.kick();const closedLagMs=state.round?.closedAt?Date.parse(state.round.closedAt)-Date.parse(state.round.closesAt):null;console.log(JSON.stringify({kind:'worker_tick_timing',at:state.serverTime,roundId:state.round?.id,status:state.round?.status,tickMs:Math.round(performance.now()-tickStart),closedLagMs,lineScheduled}))}catch(error){console.error(JSON.stringify({status:'ERROR',errorCode:'round_worker_tick_failed',code:typeof error==='object'&&error!==null&&'code' in error&&typeof error.code==='string'&&/^[A-Z0-9_]{2,12}$/.test(error.code)?error.code:undefined}))}if(running)await new Promise(resolve=>setTimeout(resolve,1000))}
 await linePump.drain();
 await database().end();
}
main().catch(()=>{console.error(JSON.stringify({status:'ERROR',errorCode:'round_worker_fatal'}));process.exitCode=1});

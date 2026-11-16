import {determineParity,extractLastDisplayedDigit,validateScaleDisplay} from './core';
import type {OneShotOutcome} from './one-shot-scan';

/**
 * Preview-only hypothesis. Never feed into round locking or settlement.
 * Preserve uncertainty about a missing decimal point instead of inventing it.
 * The minimum confidence for a guess is strictly greater than 60%.\n * A conflict can still produce a labeled hypothesis, never a verified reading.
 */
export function previewGuess(outcome:OneShotOutcome){
 if(outcome.status!=='REVIEW_REQUIRED'||!['low_confidence','conflicting_ocr_results'].includes(outcome.reason))return null;
 const confidence=outcome.confidence??0;
 if(!Number.isFinite(confidence)||confidence<=60||!outcome.rawText)return null;
 let number:string;
 try{number=validateScaleDisplay(outcome.rawText)}catch{return null}
 const lastDigit=extractLastDisplayedDigit(number);
 return {status:'GUESS' as const,number,lastDigit,parity:determineParity(lastDigit),confidence,reason:outcome.reason==='conflicting_ocr_results'?'preview_only_conflicting_results':'preview_only_low_confidence',decimalVerified:false,roi:outcome.roi};
}

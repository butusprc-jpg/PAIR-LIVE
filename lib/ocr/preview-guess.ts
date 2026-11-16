import {determineParity,extractLastDisplayedDigit,validateScaleDisplay} from './core';
import type {OneShotOutcome} from './one-shot-scan';

/**
 * Preview-only hypothesis. Never feed into round locking or settlement.
 * Preserve uncertainty about a missing decimal point instead of inventing it.
 * The minimum confidence for a guess is strictly greater than 60%.
 */
export function previewGuess(outcome:OneShotOutcome){
 if(outcome.status!=='REVIEW_REQUIRED'||outcome.reason!=='low_confidence')return null;
 const confidence=outcome.confidence??0;
 if(!Number.isFinite(confidence)||confidence<=60||!outcome.rawText)return null;
 let number:string;
 try{number=validateScaleDisplay(outcome.rawText)}catch{return null}
 const lastDigit=extractLastDisplayedDigit(number);
 return {status:'GUESS' as const,number,lastDigit,parity:determineParity(lastDigit),confidence,reason:'preview_only_low_confidence',decimalVerified:false,roi:outcome.roi};
}

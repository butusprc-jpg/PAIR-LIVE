import test from 'node:test';
import assert from 'node:assert/strict';
import {previewGuess} from '../lib/ocr/preview-guess';
import type {OneShotOutcome} from '../lib/ocr/one-shot-scan';

function review(reason:string,confidence:number,rawText='58756'):OneShotOutcome{
 return {status:'REVIEW_REQUIRED',reason,confidence,rawText};
}
test('preview guess above 60% predicts last digit, not decimal',()=>{
 const guess=previewGuess(review('low_confidence',67));
 assert.deepEqual(guess,{status:'GUESS',number:'58756',lastDigit:'6',parity:'EVEN',confidence:67,reason:'preview_only_low_confidence',decimalVerified:false,roi:undefined});
});
test('60% is not enough',()=>assert.equal(previewGuess(review('low_confidence',60)),null));
test('conflicting results never generate a guess',()=>assert.equal(previewGuess(review('conflicting_ocr_results',90)),null));
test('missing or invalid numeric text is rejected',()=>assert.equal(previewGuess(review('low_confidence',85,'56?')),null));
test('odd digit can be suggested if reading is unambiguous',()=>assert.equal(previewGuess(review('low_confidence',61,'2.47'))?.parity,'ODD'));

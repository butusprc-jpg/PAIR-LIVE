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
test('conflicting results >60% provide a preview-only uncertain guess',()=>{const guess=previewGuess(review('conflicting_ocr_results',96,'5.8343'));assert.equal(guess?.status,'GUESS');assert.equal(guess?.reason,'preview_only_conflicting_results');assert.equal(guess?.lastDigit,'3');assert.equal(guess?.parity,'ODD')});
test('conflicting results <=60% do not generate a guess',()=>assert.equal(previewGuess(review('conflicting_ocr_results',60)),null));
test('missing or invalid numeric text is rejected',()=>assert.equal(previewGuess(review('low_confidence',85,'56?')),null));
test('odd digit can be suggested if reading is unambiguous',()=>assert.equal(previewGuess(review('low_confidence',61,'2.47'))?.parity,'ODD'));

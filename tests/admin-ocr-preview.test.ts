import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {saveAdminPreviewFrame,getAdminPreviewFrame} from '../lib/ocr/admin-preview-frame';
import {roiForFrame} from '../lib/ocr/live-frame-source';
import {TesseractOcrAdapter} from '../lib/ocr/engine';
import {determineParity,extractLastDisplayedDigit,type Frame} from '../lib/ocr/core';

test('OCR reads the exact stored preview frame and saved ROI without recapture',async()=>{
 const image=await readFile('tests/fixtures/scale/5.8756.png');
 const frame:Frame={id:'preview',roundId:'0',source:'MOBILE_CAMERA',capturedAt:new Date().toISOString(),image,width:640,height:240,healthy:true};
 const id=saveAdminPreviewFrame(frame,'admin','camera','oa',1000);
 const same=getAdminPreviewFrame(id,'admin','camera','oa',1001);
 assert.strictEqual(same,frame);
 const reading=await new TesseractOcrAdapter().read(same!,roiForFrame({x:0,y:0,width:10000,height:10000},same!));
 assert.equal(reading.normalizedText,'5.8756');
 assert.equal(extractLastDisplayedDigit(reading.normalizedText),'6');
 assert.equal(determineParity('6'),'EVEN');
 assert.equal(getAdminPreviewFrame(id,'other','camera','oa',1001),null);
 assert.equal(getAdminPreviewFrame(id,'admin','other','oa',1001),null);
 assert.equal(getAdminPreviewFrame(id,'admin','camera','oa',301001),null);
});

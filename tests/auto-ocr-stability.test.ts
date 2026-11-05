import test from 'node:test';
import assert from 'node:assert/strict';
import {AutoOcrStability} from '../lib/ocr/auto-stability';
const box={x:100,y:50,width:120,height:40};
const sample=(id:number,text='0.250',x=100)=>({frameId:`frame-${id}`,capturedAt:id*500,text,confidence:90,box:{...box,x}});
test('locks only after two seconds and distinct frames; preserves trailing zero',()=>{
 const gate=new AutoOcrStability();
 assert.equal(gate.add(sample(1)).state,'TRACKING');
 for(let i=2;i<5;i++)assert.equal(gate.add(sample(i)).state,'STABILIZING');
 const locked=gate.add(sample(5));assert.equal(locked.state,'LOCKED');
 assert.deepEqual([locked.lock?.text,locked.lock?.lastDigit,locked.lock?.parity],['0.250','0','EVEN']);
 assert.equal(gate.add(sample(6,'9.999')).lock,locked.lock);
});
test('changed decimal or value restarts stability window',()=>{
 const gate=new AutoOcrStability();gate.add(sample(1));gate.add(sample(2));
 assert.equal(gate.add(sample(3,'0.25')).state,'TRACKING');
 for(const i of [4,5,6])assert.equal(gate.add(sample(i,'0.25')).state,'STABILIZING');
 assert.equal(gate.add(sample(7,'0.25')).state,'LOCKED');
});
test('missing or moved box clears tracking; low confidence and duplicate frame require review',()=>{
 const gate=new AutoOcrStability();gate.add(sample(1));
 assert.equal(gate.add(sample(2,'0.250',300)).state,'SEARCHING');
 gate.add(sample(3));assert.equal(gate.missing().state,'SEARCHING');
 gate.add(sample(4));assert.equal(gate.add(sample(4)).state,'REVIEW_REQUIRED');
 assert.equal(gate.add({...sample(5),confidence:20}).state,'REVIEW_REQUIRED');
 gate.reset();assert.equal(gate.result.state,'SEARCHING');
});
test('ambiguous OCR cannot lock',()=>{
 const gate=new AutoOcrStability();assert.equal(gate.add(sample(1,'0.25 kg')).state,'REVIEW_REQUIRED');
});

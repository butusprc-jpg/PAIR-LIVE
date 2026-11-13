import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {entryFormError} from '../lib/client/entry-form';

const ready={open:true,side:'คู่' as const,points:'50',balance:100,min:10,max:80,walletMode:'legacy' as const,frozen:false};

test('PLAY selection and amount remain editable before a round; only submission depends on OPEN',async()=>{
 const page=await readFile(new URL('../app/page.tsx',import.meta.url),'utf8');
 for(const side of ['คู่','คี่'])assert.match(page,new RegExp(`disabled=\\{sending\\} onClick=\\{\\(\\)=>\\{idempotencyKey.current=null;setSide\\('${side}'\\)\\}\\}`));
 assert.match(page,/onChange=\{e=>\{idempotencyKey\.current=null;setPoints\(e\.target\.value\)\}\} disabled=\{sending\}/);
 assert.match(page,/disabled=\{!open\|\|sending\|\|walletMode/);
 assert.equal(entryFormError({...ready,open:false}), 'ยังไม่เปิดรับคำทาย');
 assert.equal(entryFormError({...ready,side:'คี่'}),null);
 assert.equal(entryFormError(ready),null);
});

test('PLAY amount checks integer, current round limits, balance, and wallet readiness',()=>{
 assert.equal(entryFormError({...ready,points:''}),'กรุณากรอกแต้มจำนวนเต็มมากกว่า 0');
 assert.equal(entryFormError({...ready,points:'1.5'}),'กรุณากรอกแต้มจำนวนเต็มมากกว่า 0');
 assert.match(entryFormError({...ready,points:'9'})!,/10.*80/);
 assert.match(entryFormError({...ready,points:'81'})!,/10.*80/);
 assert.equal(entryFormError({...ready,points:'80',balance:50}),'แต้มไม่เพียงพอ');
 assert.match(entryFormError({...ready,walletMode:'error'})!,/ตรวจยอดแต้ม/);
 assert.match(entryFormError({...ready,frozen:true})!,/ตรวจยอดแต้ม/);
 assert.equal(entryFormError({...ready,side:null}),'กรุณาเลือกคู่หรือคี่');
});

test('ADMIN play rules are a main tab with a directly visible editor and role-gated save',async()=>{
 const admin=await readFile(new URL('../app/admin/page.tsx',import.meta.url),'utf8');
 const css=await readFile(new URL('../app/globals.css',import.meta.url),'utf8');
 assert.match(admin,/id:'play-rules',label:'กติกาการเล่น'/);
 assert.match(admin,/tab==='play-rules'&&<section className="card admin-play-rules"/);
 assert.match(admin,/role==='admin'\?<><label htmlFor="admin-play-rules-content"/);
 assert.match(admin,/<textarea id="admin-play-rules-content"[^>]+value=\{playRules\}/);
 assert.match(admin,/mutation\('\/api\/admin\/play-rules'/);
 assert.doesNotMatch(admin,/rulesOpen|showPlayRules/);
 assert.match(css,/\.admin-play-rules \.rules-editor\{min-height:260px/);
});

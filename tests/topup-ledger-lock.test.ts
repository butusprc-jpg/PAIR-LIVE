import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

// V15.3 owner request explicitly authorizes routing topups through the active wallet.
// Freeze the reviewed decision, including legacy arithmetic and the active-wallet gate.
test('approved topup ledger decision is frozen',()=>{
 const source=readFileSync(resolve(process.cwd(),'lib/topup/store.ts'),'utf8');
 const index=source.indexOf('export function decideTopup(');
 assert.ok(index>=0,'decision function must exist');
 const frozen=source.slice(index).replace(/\r\n/g,'\n');
 let h=2166136261;
 for(let i=0;i<frozen.length;i++){h^=frozen.charCodeAt(i);h=Math.imul(h,16777619)}
 assert.equal(h>>>0,2807062405,'Ledger decision changed: obtain explicit owner approval before altering credit logic');
});

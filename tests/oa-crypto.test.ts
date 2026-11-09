import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {encryptOaSecret,decryptOaSecret} from '../lib/server/oa-crypto';

test('two OA secrets cannot be substituted across tenants or fields',()=>{
 const old=process.env.OA_CREDENTIAL_ENCRYPTION_KEY;process.env.OA_CREDENTIAL_ENCRYPTION_KEY=randomBytes(32).toString('base64');
 try{
  const a=encryptOaSecret('shop-a','messaging-token','token-a');const b=encryptOaSecret('shop-b','messaging-token','token-b');
  assert.notEqual(a,b);assert.equal(decryptOaSecret('shop-a','messaging-token',a),'token-a');
  assert.equal(decryptOaSecret('shop-b','messaging-token',b),'token-b');
  assert.throws(()=>decryptOaSecret('shop-b','messaging-token',a));
  assert.throws(()=>decryptOaSecret('shop-a','messaging-secret',a));
  assert.throws(()=>decryptOaSecret('shop-a','messaging-token',a.slice(0,-2)+'AA'));
 }finally{if(old===undefined)delete process.env.OA_CREDENTIAL_ENCRYPTION_KEY;else process.env.OA_CREDENTIAL_ENCRYPTION_KEY=old}
});

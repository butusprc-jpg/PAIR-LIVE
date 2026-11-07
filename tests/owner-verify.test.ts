import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyConnectedBot} from '../lib/owner/verify-bot';
import {OwnerError} from '../lib/owner/errors';
test('LINE bot info must match the exact OA basicId',async()=>{
 const accepted=await verifyConnectedBot('@shopA','private-token',async()=>Response.json({basicId:'@shopA'}) as never);
 assert.match(accepted,/^[0-9a-f]{64}$/);
 await assert.rejects(verifyConnectedBot('@shopB','private-token',async()=>Response.json({basicId:'@shopA'}) as never),(error:unknown)=>error instanceof OwnerError&&error.code==='oa_binding_unverified');
});

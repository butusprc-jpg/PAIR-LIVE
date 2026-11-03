import {verifyLineAccessToken} from '../../../lib/auth-core';
import type {LineIdentityProvider} from '../types';
import {assertServerRuntime} from './runtime';
/** Reuse PAIR LIVE 2/8's LINE verification, itself adapted from LekHub. */
export function createPairLiveLineProvider(request:typeof fetch=fetch):LineIdentityProvider {
 assertServerRuntime();
 // Keep Core untouched while requiring well-typed expiry metadata before reuse.
 const checkedRequest=(async (input:RequestInfo|URL,init?:RequestInit)=>{
  assertServerRuntime();const response=await request(input,init);
  if(String(input).startsWith('https://api.line.me/oauth2/v2.1/verify?')&&response.ok){
   let metadata:unknown;try{metadata=await response.clone().json()}catch{return new Response(null,{status:401})}
   const value=metadata as {client_id?:unknown;expires_in?:unknown}|null;
   if(!value||typeof value.client_id!=='string'||typeof value.expires_in!=='number'||!Number.isFinite(value.expires_in)||value.expires_in<=0)return new Response(null,{status:401});
  }
  return response;
 }) as typeof fetch;
 return {async verify(token,channelId){
  assertServerRuntime();const identity=await verifyLineAccessToken(token,channelId,checkedRequest);
  if(identity.provider!=='line')throw new Error('identity_invalid');
  return {...identity,provider:'line'};
 }};
}

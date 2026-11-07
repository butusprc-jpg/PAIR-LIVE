import {createHash} from 'node:crypto';
import {OwnerError} from './errors';
/** Confirm that the configured Messaging API token belongs to this OA.
 * LINE returns the OA basicId from /v2/bot/info. */
export async function verifyConnectedBot(expectedBasicId:string,accessToken:string,request:typeof fetch=fetch){
 let response:Response;try{response=await request('https://api.line.me/v2/bot/info',{headers:{Authorization:`Bearer ${accessToken}`},cache:'no-store',signal:AbortSignal.timeout(8000)})}catch{throw new OwnerError('oa_binding_unverified',503)}
 if(!response.ok)throw new OwnerError('oa_binding_unverified',503);
 let body:{basicId?:unknown};try{body=await response.json()}catch{throw new OwnerError('oa_binding_unverified',503)}
 if(body.basicId!==expectedBasicId)throw new OwnerError('oa_binding_unverified',409);
 return createHash('sha256').update(accessToken).digest('hex');
}

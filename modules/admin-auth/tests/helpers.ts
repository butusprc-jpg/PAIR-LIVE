import {createAdminAuth} from '../server/auth';
import type {AdminAuthConfig, AdminChallenge, AdminIdentity, AdminSession, AdminAuditEvent, LineIdentity} from '../types';

export const origin='https://pair.example';
export const lineIdentity:LineIdentity={provider:'line',providerChannelId:'channel',providerUserId:'allowed',displayName:'Verified Admin',avatarUrl:null};
export function setup(overrides:Partial<AdminAuthConfig>={}) {
 let now=1_800_000_000_000;
 const identities=new Map<string,AdminIdentity>();
 const sessions=new Map<string,AdminSession>();
 const challenges=new Map<string,AdminChallenge>();
 const audits:AdminAuditEvent[]=[];
 const config:AdminAuthConfig={
  channelId:'channel',origin,environment:'production',allowlist:[{userId:'allowed',role:'admin'}],
  now:()=>now,
  identityProvider:{async verify(token){if(token!=='verified-line-token')throw new Error('invalid');return {...lineIdentity}}},
  database:{async upsertAllowedIdentity(identity){const previous=identities.get('admin-1');const row={...identity,id:'admin-1',status:previous?.status??'active'} as AdminIdentity;identities.set(row.id,row);return {...row}},async findIdentity(id){const row=identities.get(id);return row?{...row}:null},async audit(event){audits.push(event)}},
  sessionStore:{async insert(session){sessions.set(session.tokenHash,{...session})},async find(hash){const row=sessions.get(hash);return row?{...row}:null},async revoke(hash,time){const row=sessions.get(hash);if(row)row.revokedAt=time},async putChallenge(challenge){challenges.set(challenge.tokenHash,{...challenge})},async consumeChallenge(hash,sessionHash,purpose,time){const row=challenges.get(hash);if(!row||row.sessionHash!==sessionHash||row.purpose!==purpose||row.expiresAt<=time)return false;challenges.delete(hash);return true}},
  ...overrides,
 };
 return {config,auth:createAdminAuth(config),identities,sessions,challenges,audits,advance:(ms:number)=>{now+=ms}};
}
export function request(path:string, options:{method?:string;cookie?:string;csrf?:string;body?:unknown;requestOrigin?:string|null}={}) {
 const headers=new Headers();
 if(options.requestOrigin!==null)headers.set('origin',options.requestOrigin??origin);
 if(options.cookie)headers.set('cookie',options.cookie);
 if(options.csrf)headers.set('x-admin-csrf',options.csrf);
 if(options.body!==undefined)headers.set('content-type','application/json');
 return new Request(origin+path,{method:options.method??'GET',headers,body:options.body===undefined?undefined:JSON.stringify(options.body)});
}
export function cookies(response:Response):string {
 return response.headers.getSetCookie().map(value=>value.split(';')[0]).filter(value=>!value.endsWith('=')).join('; ');
}
export async function login(f=setup(), previousCookie='') {
 const challenge=await f.auth.handleAdminChallenge(request('/challenge',{method:'POST',cookie:previousCookie,body:{purpose:'login'}}));
 const payload=await challenge.json() as {ok:boolean;csrfToken:string};
 const challengeCookie=cookies(challenge);
 const response=await f.auth.handleAdminLogin(request('/login',{method:'POST',cookie:[previousCookie,challengeCookie].filter(Boolean).join('; '),csrf:payload.csrfToken,body:{accessToken:'verified-line-token'}}));
 return {f,response,cookie:cookies(response),csrf:payload.csrfToken,challengeCookie};
}

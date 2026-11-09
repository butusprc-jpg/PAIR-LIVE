export type MemberSessionView={id:string;displayName:string;avatarUrl:string|null;provider:string;demoPoints:number};
export type RuntimeConfig={lineConfigured:boolean;wechatConfigured:boolean;liffId?:string;oaKey?:string};
export type MemberStartup={kind:'member';member:MemberSessionView}|{kind:'login';runtime:RuntimeConfig};

/** The session cookie is the authority; only request public provider config after a 401. */
export async function memberStartup(fetcher:typeof fetch=fetch,oaKey:string|null=typeof window!=='undefined'?new URLSearchParams(window.location.search).get('oa'):null):Promise<MemberStartup>{
 const suffix=oaKey?'?oa='+encodeURIComponent(oaKey):'';
 const session=await fetcher('/api/auth/session'+suffix,{cache:'no-store',credentials:'same-origin'});
 if(session.status===401){
  const runtime=await fetcher('/api/auth/runtime'+suffix,{cache:'no-store'});
  if(!runtime.ok)throw new Error('auth_runtime_unavailable');
  return {kind:'login',runtime:await runtime.json() as RuntimeConfig};
 }
 if(!session.ok)throw new Error('member_session_unavailable');
 const data=await session.json() as {member?:MemberSessionView};
 if(!data.member?.id)throw new Error('member_session_unavailable');
 return {kind:'member',member:data.member};
}

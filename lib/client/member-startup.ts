export type MemberSessionView={id:string;displayName:string;avatarUrl:string|null;provider:string;demoPoints:number};
export type RuntimeConfig={lineConfigured:boolean;wechatConfigured:boolean};
export type MemberStartup={kind:'member';member:MemberSessionView}|{kind:'login';runtime:RuntimeConfig};

/** The session cookie is the authority; only request public provider config after a 401. */
export async function memberStartup(fetcher:typeof fetch=fetch):Promise<MemberStartup>{
 const session=await fetcher('/api/auth/session',{cache:'no-store',credentials:'same-origin'});
 if(session.status===401){
  const runtime=await fetcher('/api/auth/runtime',{cache:'no-store'});
  if(!runtime.ok)throw new Error('auth_runtime_unavailable');
  return {kind:'login',runtime:await runtime.json() as RuntimeConfig};
 }
 if(!session.ok)throw new Error('member_session_unavailable');
 const data=await session.json() as {member?:MemberSessionView};
 if(!data.member?.id)throw new Error('member_session_unavailable');
 return {kind:'member',member:data.member};
}

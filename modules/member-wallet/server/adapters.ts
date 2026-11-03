import type {AdminAuthorizationAdapter,MemberIdentityAdapter} from '../types';
/** Wrap the host's verified member session; never derive wallet owner from JSON, profile name, or provider ID. */
export function memberSessionAdapter<Context>(resolve:(context:Context)=>Promise<{id:string}|null>):MemberIdentityAdapter<Context>{
 return {async memberId(context){const member=await resolve(context);return member?.id??null}};
}
/** Wrap Admin Auth's requireAdmin before allowing test-point grants. */
export function adminSessionAdapter<Context>(requireAdmin:(context:Context)=>Promise<{ok:boolean;value?:{admin:{id:string}}}>):AdminAuthorizationAdapter<Context>{
 return {async requireAdmin(context){const result=await requireAdmin(context);return result.ok&&result.value?.admin?.id?{id:result.value.admin.id}:null}};
}

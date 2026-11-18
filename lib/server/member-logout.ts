import {NextResponse} from 'next/server';

/** Revoke the server session before clearing the browser cookie. */
export async function memberLogoutResponse(token:string|undefined,cookieName:string,revoke:(token:string)=>Promise<unknown>){
 if(token){
  try{await revoke(token)}catch{return NextResponse.json({ok:false,error:'session_revoke_failed'},{status:503,headers:{'Cache-Control':'no-store'}})}
 }
 const response=NextResponse.json({ok:true},{headers:{'Cache-Control':'no-store'}});
 response.cookies.delete(cookieName);
 return response;
}

'use client';
// Adapted from LekHub lib/liff.ts: one LIFF initialization per browser tab.
type LiffClient=typeof import('@line/liff').default;
let ready:Promise<LiffClient>|null=null;
let redirecting=false;
export function shouldRedirectLogin(storage:Pick<Storage,'getItem'|'setItem'>,now=Date.now()){
 const key='pair-live:liff-login-redirect',previous=Number(storage.getItem(key));
 if(redirecting||previous>0&&now-previous<10_000)return false;
 redirecting=true;storage.setItem(key,String(now));return true;
}
export async function initLIFF(){
 const liffId=process.env.NEXT_PUBLIC_LINE_LIFF_ID;
 if(!liffId)throw new Error('line_not_configured');
 ready??=import('@line/liff').then(({default:liff})=>liff.init({liffId}).then(()=>liff)).catch(error=>{ready=null;throw error});
 const client=await ready;
 if(!client.isLoggedIn()){
  if(shouldRedirectLogin(window.sessionStorage))client.login({redirectUri:window.location.href});
  return null;
 }
 redirecting=false;window.sessionStorage.removeItem('pair-live:liff-login-redirect');
 const token=client.getAccessToken();if(!token)throw new Error('line_access_token_missing');
 return {client,accessToken:token};
}

'use client';
// Adapted from LekHub lib/liff.ts: one LIFF initialization per browser tab.
import liff from '@line/liff';
let ready:Promise<typeof liff>|null=null;
export async function initLIFF(){
 const liffId=process.env.NEXT_PUBLIC_LINE_LIFF_ID;
 if(!liffId)throw new Error('line_not_configured');
 ready??=liff.init({liffId}).then(()=>liff).catch(error=>{ready=null;throw error});
 const client=await ready;
 if(!client.isLoggedIn()){client.login({redirectUri:window.location.href});return null}
 const token=client.getAccessToken();if(!token)throw new Error('line_access_token_missing');
 return {client,accessToken:token};
}

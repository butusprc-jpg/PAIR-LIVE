/** Staging-only, read-only diagnostic. Never exposes access tokens or endpoint URLs. */
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store'};
export async function GET(){
 if(process.env.RAILWAY_ENVIRONMENT_NAME!=='staging'||process.env.RAILWAY_SINGLE_OA_MODE!=='true')return Response.json({error:'not_found'},{status:404,headers});
 const token=process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN;
 const domain=process.env.RAILWAY_PUBLIC_DOMAIN;
 if(!token||!domain)return Response.json({status:'CONFIGURATION_MISSING'},{status:503,headers});
 try{
  const response=await fetch('https://api.line.me/v2/bot/channel/webhook/endpoint',{
   headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:AbortSignal.timeout(5000)
  });
  if(!response.ok)return Response.json({status:'LINE_API_UNAVAILABLE',httpStatus:response.status},{status:503,headers});
  const data=await response.json() as {endpoint?:unknown;active?:unknown};
  const expected=`https://${domain}/api/line/webhook`;
  return Response.json({status:data.endpoint===expected&&data.active===true?'MATCH':data.active===false?'INACTIVE':'MISMATCH',webhookActive:data.active===true,environment:'staging'},{headers});
 }catch{return Response.json({status:'LINE_API_UNAVAILABLE'},{status:503,headers})}
}

import {TopupError} from './store';

/** A staging request cannot be approved when LINE posts its card to another database. */
export async function requireMatchingStagingWebhook(fetcher:typeof fetch=fetch){
 if(process.env.RAILWAY_ENVIRONMENT_ID!=='1eae6433-f3f1-474c-b1c6-aed7632ccdbf')return;
 const token=process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN;
 const domain=process.env.RAILWAY_PUBLIC_DOMAIN;
 if(!token||!domain)throw new TopupError('line_webhook_configuration_missing',503);
 try{
  const response=await fetcher('https://api.line.me/v2/bot/channel/webhook/endpoint',{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw new TopupError('line_webhook_check_unavailable',503);
  const data=await response.json() as {endpoint?:unknown;active?:unknown};
  if(data.active!==true||data.endpoint!==`https://${domain}/api/line/webhook`)throw new TopupError('line_webhook_staging_mismatch',503);
 }catch(error){if(error instanceof TopupError)throw error;throw new TopupError('line_webhook_check_unavailable',503)}
}

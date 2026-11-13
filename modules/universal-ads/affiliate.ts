/** Generic affiliate campaign adapter for approved publisher programs.
 * No provider script is injected; only explicitly configured HTTPS creatives/links.
 * Commissions and conversion data must come from the provider's verified reports.
 */
export type AffiliateCampaign={
 id:string;provider:'accesstrade'|'involve_asia'|'shopee'|'other';
 creativeUrl:string;trackingUrl:string;alt:string;
 approvedForChannel:boolean;enabled:boolean;
 startsAt?:string;endsAt?:string;
};
export function validateAffiliateCampaign(c:AffiliateCampaign|null,now=new Date()){
 if(!c?.enabled||!c.approvedForChannel||!c.id||!c.alt)return null;
 try {
  const creative=new URL(c.creativeUrl),link=new URL(c.trackingUrl);
  if(creative.protocol!=='https:'||link.protocol!=='https:'||link.username||link.password)return null;
  const start=c.startsAt?Date.parse(c.startsAt):-Infinity;
  const end=c.endsAt?Date.parse(c.endsAt):Infinity;
  if(Number.isNaN(start)||Number.isNaN(end)||start>=end||now.getTime()<start||now.getTime()>=end)return null;
  return {...c,creativeUrl:creative.href,trackingUrl:link.href};
 }catch{return null}
}

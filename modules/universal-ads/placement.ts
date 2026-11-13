/** Reusable, fail-closed ad-placement policy. No live ad tags. */
export type AdContext = 'line_embedded'|'embedded'|'external_candidate';
export type Sponsor = {id:string;imageUrl:string;href:string;alt:string;enabled:boolean;startsAt?:string;endsAt?:string};
export type AdConfig = {enabled:boolean;killSwitch?:boolean;sponsorEnabled?:boolean;googleEnabled?:boolean;googleAccountApproved?:boolean;siteApproved?:boolean;googlePolicyReviewed?:boolean;consentSatisfied?:boolean};
export function classifyContext(userAgent:string,isLiff=false):AdContext {
 if(isLiff||/Line\//i.test(userAgent))return 'line_embedded';
 if(/\b(wv|WebView|FBAN|FBAV|Instagram)\b/i.test(userAgent))return 'embedded';
 return 'external_candidate';
}
export function validateSponsor(input:Sponsor|null,now=new Date()):Sponsor|null {
 if(!input||!input.id||!input.alt||input.enabled!==true)return null;
 try {
  const image=new URL(input.imageUrl),target=new URL(input.href);
  if(image.protocol!=='https:'||target.protocol!=='https:')return null;
  const start=input.startsAt?Date.parse(input.startsAt):-Infinity,end=input.endsAt?Date.parse(input.endsAt):Infinity;
  if(Number.isNaN(start)||Number.isNaN(end)||start>=end||now.getTime()<start||now.getTime()>=end)return null;
  return {...input,imageUrl:image.href,href:target.href};
 }catch{return null}
}
export function chooseAd(config:AdConfig,context:AdContext,sponsor:Sponsor|null,now=new Date()){
 if(config.killSwitch||!config.enabled)return {type:'none' as const};
 if(context==='external_candidate'&&config.googleEnabled&&config.googleAccountApproved&&config.siteApproved&&config.googlePolicyReviewed&&config.consentSatisfied)return {type:'google_anchor' as const};
 const candidate=config.sponsorEnabled?validateSponsor(sponsor,now):null;
 return candidate?{type:'sponsor' as const,sponsor:candidate}:{type:'none' as const};
}

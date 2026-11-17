import {t,type Locale} from '../i18n';
function playUrl(){
 const liff=process.env.NEXT_PUBLIC_LINE_LIFF_ID;
 if(liff&&/^\d+-[A-Za-z0-9]+$/.test(liff))return `https://liff.line.me/${liff}`;
 const base=process.env.NEXT_PUBLIC_APP_BASE_URL;
 if(base){const url=new URL(base);if(url.protocol==='https:'&&!url.username&&!url.password)return url.origin+'/'}
 throw new Error('play_url_not_configured');
}
function card(title:string,lines:string[],label:string){return {type:'flex' as const,altText:`PAIR LIVE · ${title}`,contents:{type:'bubble' as const,size:'mega' as const,body:{type:'box' as const,layout:'vertical' as const,spacing:'md' as const,contents:[{type:'text' as const,text:'PAIR LIVE',weight:'bold' as const,size:'lg' as const},{type:'text' as const,text:title,weight:'bold' as const,wrap:true},...lines.map(text=>({type:'text' as const,text,wrap:true}))]},footer:{type:'box' as const,layout:'vertical' as const,contents:[{type:'button' as const,style:'primary' as const,action:{type:'uri' as const,label,uri:playUrl()}}]}}}}
export function liveStartCard(shopName:string|null,locale:Locale='th'){return card(t('line.live.title',locale),[t('line.live.status',locale),...(shopName?.trim()?[t('line.live.shop',locale,{name:shopName.trim().slice(0,80)})]:[])],t('line.live.open',locale))}
export function countdownStartCard(roundId:string,durationSeconds:number,locale:Locale='th'){if(!/^\d+$/.test(roundId)||!Number.isSafeInteger(durationSeconds)||durationSeconds<1)throw new Error('invalid_countdown_card');return card(t('line.countdown.title',locale),[t('line.countdown.round',locale,{round:roundId}),t('line.countdown.time',locale,{seconds:durationSeconds})],t('line.countdown.open',locale))}

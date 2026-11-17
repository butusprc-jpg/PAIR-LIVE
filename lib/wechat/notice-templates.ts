import {t} from '../i18n';
import {resultNoticeText,type ResultNotice} from '../line/game-notices';

/** Text templates only. No recipient lookup or WeChat delivery is enabled. */
export function wechatLiveStartText(shopName:string|null){
 return [t('line.live.title','zh-CN'),t('line.live.status','zh-CN'),...(shopName?.trim()?[t('line.live.shop','zh-CN',{name:shopName.trim().slice(0,80)})]:[])].join('\n');
}
export function wechatCountdownText(roundId:string,seconds:number){
 if(!/^\d+$/.test(roundId)||!Number.isSafeInteger(seconds)||seconds<1)throw Error('invalid_countdown');
 return [t('line.countdown.title','zh-CN'),t('line.countdown.round','zh-CN',{round:roundId}),t('line.countdown.time','zh-CN',{seconds})].join('\n');
}
export function wechatResultText(notice:ResultNotice){return resultNoticeText(notice,'zh-CN')}

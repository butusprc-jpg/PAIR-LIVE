import type {Locale} from '../i18n';

/** Database values are validated again at the delivery boundary. */
export function recipientLocale(value:unknown):Locale{
 return value==='zh-CN'||value==='en'?value:'th';
}

import type {Locale} from './i18n';

export const LANGUAGE_STORAGE_KEY='pair-live:language';
export type LanguageSource='choice'|'line'|'wechat'|'browser'|'default';
export type LanguageResult={locale:Locale;source:LanguageSource};

export function normalizeLanguage(value:unknown):Locale|null{
 if(typeof value!=='string')return null;
 const code=value.trim().replace(/_/g,'-').toLowerCase();
 if(/^th(?:-|$)/.test(code))return 'th';
 if(/^zh(?:-|$)/.test(code))return 'zh-CN';
 if(/^en(?:-|$)/.test(code))return 'en';
 return null;
}

export function detectLanguage(input:{choice?:unknown;line?:unknown;wechat?:unknown;browserLanguages?:readonly string[];browserLanguage?:unknown}):LanguageResult{
 for(const [source,value] of [['choice',input.choice],['line',input.line],['wechat',input.wechat]] as const){
  const locale=normalizeLanguage(value);if(locale)return {locale,source};
 }
 for(const value of [...(input.browserLanguages??[]),input.browserLanguage]){
  const locale=normalizeLanguage(value);if(locale)return {locale,source:'browser'};
 }
 return {locale:'th',source:'default'};
}

export function readLanguageChoice(storage:Pick<Storage,'getItem'>):Locale|null{
 try{return normalizeLanguage(storage.getItem(LANGUAGE_STORAGE_KEY))}catch{return null}
}

export function saveLanguageChoice(storage:Pick<Storage,'setItem'>,value:unknown):Locale{
 const locale=normalizeLanguage(value);
 if(!locale)throw new RangeError('unsupported_language');
 storage.setItem(LANGUAGE_STORAGE_KEY,locale);
 return locale;
}

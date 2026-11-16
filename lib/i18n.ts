import thai from '../locales/th.json';
import chinese from '../locales/zh-CN.json';
import english from '../locales/en.json';

export const supportedLocales=['th','zh-CN','en'] as const;
export type Locale=typeof supportedLocales[number];
export type TranslationValues=Readonly<Record<string,string|number>>;
type Catalog=Readonly<Record<string,string>>;
type Catalogs=Readonly<Record<Locale,Catalog>>;
const catalogs:Catalogs={th:thai,'zh-CN':chinese,en:english};
const intlLocale:Record<Locale,string>={th:'th-TH','zh-CN':'zh-CN',en:'en-US'};

export function createTranslator(resources:Catalogs){
 return (key:string,locale:Locale,values:TranslationValues={}):string=>{
  const selected=Object.hasOwn(resources,locale)?resources[locale]:resources.th;
  const template=Object.hasOwn(selected,key)?selected[key]:Object.hasOwn(resources.th,key)?resources.th[key]:key;
  return template.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g,(match,name:string)=>Object.hasOwn(values,name)?String(values[name]):match);
 };
}
export const t=createTranslator(catalogs);
export function formatNumber(value:number,locale:Locale,options?:Intl.NumberFormatOptions){
 return new Intl.NumberFormat(intlLocale[locale]??intlLocale.th,options).format(value);
}
export function formatDate(value:Date|string|number,locale:Locale,options:Intl.DateTimeFormatOptions={dateStyle:'medium'}){
 const date=value instanceof Date?value:new Date(value);
 if(Number.isNaN(date.getTime()))throw new RangeError('invalid_date');
 return new Intl.DateTimeFormat(intlLocale[locale]??intlLocale.th,{timeZone:'Asia/Bangkok',...options}).format(date);
}

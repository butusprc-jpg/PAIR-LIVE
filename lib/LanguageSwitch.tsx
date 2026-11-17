'use client';
import {useLanguage} from './LanguageProvider';
import {t} from './i18n';

export function LanguageSwitch(){
 const {locale,chooseLanguage}=useLanguage();
 return <div className="member-language-switch" role="group" aria-label={t('common.language',locale)}>{([['th','ไทย'],['zh-CN','中文'],['en','EN']] as const).map(([code,label])=><button key={code} type="button" lang={code} aria-pressed={locale===code} onClick={()=>chooseLanguage(code)}>{label}</button>)}</div>;
}

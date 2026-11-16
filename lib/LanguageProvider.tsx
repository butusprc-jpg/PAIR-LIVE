'use client';
import {createContext,useCallback,useContext,useEffect,useMemo,useState} from 'react';
import type {ReactNode} from 'react';
import type {Locale} from './i18n';
import {detectLanguage,normalizeLanguage,readLanguageChoice,saveLanguageChoice} from './language';

type LanguageContextValue={locale:Locale;chooseLanguage:(value:Locale)=>void};
const LanguageContext=createContext<LanguageContextValue|null>(null);

export function LanguageProvider({children}:{children:ReactNode}){
 const [locale,setLocale]=useState<Locale>('th');
 useEffect(()=>{
  const refresh=()=>{
   let choice:Locale|null=null;
   try{choice=readLanguageChoice(window.localStorage)}catch{/* unavailable storage */}
   setLocale(detectLanguage({choice,line:window.__pairLiveLineLanguage,browserLanguages:navigator.languages,browserLanguage:navigator.language}).locale);
  };
  refresh();
  window.addEventListener('pair-live:provider-language',refresh);
  window.addEventListener('storage',refresh);
  return ()=>{window.removeEventListener('pair-live:provider-language',refresh);window.removeEventListener('storage',refresh)};
 },[]);
 const chooseLanguage=useCallback((value:Locale)=>{
  const selected=normalizeLanguage(value);
  if(!selected)throw new RangeError('unsupported_language');
  try{saveLanguageChoice(window.localStorage,selected)}catch{/* keep the choice for this page when storage is unavailable */}
  setLocale(selected);
 },[]);
 const context=useMemo(()=>({locale,chooseLanguage}),[locale,chooseLanguage]);
 return <LanguageContext.Provider value={context}>{children}</LanguageContext.Provider>;
}

export function useLanguage(){
 const context=useContext(LanguageContext);
 if(!context)throw new Error('LanguageProvider is missing');
 return context;
}

declare global{interface Window{__pairLiveLineLanguage?:string}}

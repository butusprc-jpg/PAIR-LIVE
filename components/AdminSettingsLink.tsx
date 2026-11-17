'use client';
import React from 'react';
import {useLanguage} from '../lib/LanguageProvider';
import {t} from '../lib/i18n';
import {Settings} from 'lucide-react';

/** Enter via LIFF so LINE identity is exchanged for a server admin session before /admin. */
export function AdminSettingsLink(){
 const {locale}=useLanguage();const ui=(key:string)=>t(key,locale);
 return <a className="iconbtn" href="/?view=admin" aria-label={ui("เปิดแดชบอร์ดแอดมิน")} title={ui("ตั้งค่าผู้ดูแล")}><Settings size={19}/></a>;
}

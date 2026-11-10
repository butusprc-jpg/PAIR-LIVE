'use client';
import {Settings} from 'lucide-react';

/** Enter via LIFF so LINE identity is exchanged for a server admin session before /admin. */
export function AdminSettingsLink(){
 return <a className="iconbtn" href="/?view=admin" aria-label="เปิดแดชบอร์ดแอดมิน" title="ตั้งค่าผู้ดูแล"><Settings size={19}/></a>;
}

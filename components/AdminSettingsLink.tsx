'use client';
import {Settings} from 'lucide-react';

/** Keep the admin entry visible for signed-in members; /admin enforces authorization. */
export function AdminSettingsLink(){
 return <a className="iconbtn" href="/admin" aria-label="เปิดแดชบอร์ดแอดมิน" title="ตั้งค่าผู้ดูแล"><Settings size={19}/></a>;
}

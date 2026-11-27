'use client';
import {useLanguage} from '../lib/LanguageProvider';
import {t,formatNumber} from '../lib/i18n';
import {adminError} from '../lib/admin-display';
import {useEffect,useState} from 'react';
import type {BusinessSettingKey,BusinessSettings} from '../lib/rounds/business-settings';
type Overview={settings:BusinessSettings;shopStatus:'UNCONFIGURED'|'OPEN'|'CLOSED';currentRound:{id:string;evenPoints:number;oddPoints:number;totalPoints:number;differencePoints:number;minRoundPoints:number|null}|null};
const blank={sideDifferenceLimit:'',maxRoundPoints:'',minRoundPoints:'',adminFeeRate:'',open:'',close:''};
export default function AdminBusinessSettings({role}:{role:'admin'|'operator'|'viewer'}){const {locale}=useLanguage();const ui=(key:string,values:Record<string,string|number>={})=>t(key,locale,values);
 const[data,setData]=useState<Overview|null>(null),[draft,setDraft]=useState(blank),[error,setError]=useState(false),[message,setMessage]=useState(''),[saving,setSaving]=useState<BusinessSettingKey|null>(null);
 useEffect(()=>{let active=true;fetch('/api/admin/settings/business',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error();return r.json()}).then((value:Overview)=>{if(!active)return;setData(value);setDraft({sideDifferenceLimit:value.settings.sideDifferenceLimit?.toString()??'',maxRoundPoints:value.settings.maxRoundPoints?.toString()??'',minRoundPoints:value.settings.minRoundPoints?.toString()??'',adminFeeRate:value.settings.adminFeeRate??'',open:value.settings.shopHours?.open??'',close:value.settings.shopHours?.close??''})}).catch(()=>{if(active)setError(true)});return()=>{active=false}},[]);
 async function save(key:BusinessSettingKey){
  if(saving!==null)return;
  setSaving(key);setMessage('');
  try{
   const value=key==='shopHours'?(draft.open===''&&draft.close===''?null:{open:draft.open,close:draft.close}):key==='adminFeeRate'?(draft.adminFeeRate===''?null:draft.adminFeeRate):draft[key]===''?null:Number(draft[key]);
   const challengeResponse=await fetch('/api/admin/auth/challenge',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({purpose:'mutation'})});
   const challenge=await challengeResponse.json();if(!challengeResponse.ok||!challenge.ok)throw new Error(challenge.error||'csrf_unavailable');
   const response=await fetch('/api/admin/settings/business',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Admin-CSRF':challenge.csrfToken},body:JSON.stringify({key,value})});
   const result=await response.json();if(!response.ok)throw new Error(result.error||'save_failed');
   const check=await fetch('/api/admin/settings/business',{credentials:'same-origin',cache:'no-store'});
   const refreshed=await check.json() as Overview;
   if(!check.ok)throw new Error('readback_failed');
   if(JSON.stringify(refreshed.settings[key])!==JSON.stringify(result.settings?.[key]))throw new Error('save_not_persisted');
   setData(refreshed);setMessage('บันทึกค่าสำหรับรอบถัดไปแล้ว');
  }catch(error){const code=error instanceof Error?error.message:'save_failed';setMessage('บันทึกไม่สำเร็จ ('+code+')')}
  finally{setSaving(null)}
 }
 const field=(key:'sideDifferenceLimit'|'maxRoundPoints'|'minRoundPoints',label:string,min:number)=><label>{ui(label)}<input className="field" type="number" min={min} step="1" value={draft[key]} onChange={e=>setDraft(v=>({...v,[key]:e.target.value}))} placeholder={ui("ยังไม่กำหนด")}/></label>;
 if(error)return <section className="card admin-round-settings"><h2>{ui("กติกาเพิ่มเติม")}</h2><p role="alert" className="muted">{ui("ยังไม่สามารถโหลดการตั้งค่าได้")}</p></section>;
 if(!data)return <section className="card admin-round-settings"><h2>{ui("กติกาเพิ่มเติม")}</h2><p className="muted">{ui("กำลังโหลดการตั้งค่า...")}</p></section>;
 const disabled=role!=='admin'||saving!==null;
 return <>
 <section className="card admin-round-settings"><h2>{ui("ส่วนต่างแต้มคู่/คี่")}</h2><p className="muted">{ui("ยอดต่างรอบปัจจุบัน")} {data.currentRound?formatNumber(data.currentRound.differencePoints,locale):ui("ยังไม่มีรอบ")} {ui("แต้ม · ยอดคู่")} {data.currentRound?formatNumber(data.currentRound.evenPoints,locale):'–'} {ui("· ยอดคี่")} {data.currentRound?formatNumber(data.currentRound.oddPoints,locale):'–'}</p>{field('sideDifferenceLimit','ส่วนต่างที่ตั้งไว้ (ยังไม่บังคับใช้)',0)}<button className="primary" disabled={disabled} onClick={()=>void save('sideDifferenceLimit')}>{ui("บันทึกส่วนต่าง")}</button></section>
 <section className="card admin-round-settings"><h2>{ui("ยอดแต้มสูงสุดต่อรอบ")}</h2><p className="muted">{ui("รวมแต้มคู่และคี่ · มีผลกับรอบถัดไป")}</p>{field('maxRoundPoints','ยอดรวมสูงสุด',1)}<button className="primary" disabled={disabled} onClick={()=>void save('maxRoundPoints')}>{ui("บันทึกยอดสูงสุด")}</button></section>
 <section className="card admin-round-settings"><h2>{ui("ยอดแต้มต่ำสุดต่อรอบ")}</h2><p className="muted">{ui("รอบปัจจุบันสะสม")} {data.currentRound?formatNumber(data.currentRound.totalPoints,locale):'–'} {ui("แต้ม · เป้าหมายของรอบนี้")} {data.currentRound?.minRoundPoints!=null?formatNumber(data.currentRound.minRoundPoints,locale):ui('ยังไม่กำหนด')}</p>{field('minRoundPoints','เป้าหมายยอดรวมขั้นต่ำ',1)}<p className="muted">{ui("ยังไม่ยกเลิก ปรับผล หรือคืนแต้มอัตโนมัติเมื่อยอดไม่ถึงเป้าหมาย")}</p><button className="primary" disabled={disabled} onClick={()=>void save('minRoundPoints')}>{ui("บันทึกยอดขั้นต่ำ")}</button></section>
 <section className="card admin-round-settings"><h2>{ui("ค่าดูแลระบบ")}</h2><p className="muted">{ui("ยังไม่เปิดใช้การหักค่าดูแลระบบ · ไม่มีสูตรหรือหน่วยคำนวณที่ยืนยันแล้ว")}</p><label>{ui("อัตราค่าดูแลระบบ")}<input className="field" type="text" inputMode="decimal" value={draft.adminFeeRate} onChange={e=>setDraft(v=>({...v,adminFeeRate:e.target.value}))} placeholder={ui("ยังไม่กำหนด")}/></label><button className="primary" disabled={disabled} onClick={()=>void save('adminFeeRate')}>{ui("บันทึกค่าดูแลระบบ")}</button></section>
 <section className="card admin-round-settings"><h2>{ui("เวลาเปิด–ปิดร้าน")}</h2><p className="muted">{ui("เวลาไทย Asia/Bangkok · สถานะ")} {data.shopStatus==='UNCONFIGURED'?ui("ยังไม่กำหนด"):data.shopStatus==='OPEN'?ui("เปิดร้าน"):ui("ปิดร้าน")}</p><label>{ui("เวลาเปิด")}<input className="field" type="time" value={draft.open} onChange={e=>setDraft(v=>({...v,open:e.target.value}))}/></label><label>{ui("เวลาปิด")}<input className="field" type="time" value={draft.close} onChange={e=>setDraft(v=>({...v,close:e.target.value}))}/></label><p className="muted">{ui("Auto สร้างรอบใหม่เฉพาะเวลาเปิดร้าน · Manual ไม่สร้างรอบใหม่อัตโนมัติ · รอบที่เปิดอยู่ดำเนินต่อจนจบ")}</p><button className="primary" disabled={disabled} onClick={()=>void save('shopHours')}>{ui("บันทึกเวลาเปิด–ปิด")}</button></section>
 {message&&<p role="status" className="toast">{adminError(message,locale)}</p>}
 </>;
}

'use client';
import {useEffect,useRef,useState} from 'react';
import {parseYouTubeId,embedUrl} from '../server/youtube-url';
import type {LiveMode} from '../types';
import {useLiveState} from './useLiveState';
export default function AdminLivePanel({role}:{role:'admin'|'operator'|'viewer'}){
 const {state,setState,error:loadError,seconds}=useLiveState('/api/admin/live');
 const[url,setUrl]=useState(''),[checked,setChecked]=useState<string|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[mode,setMode]=useState<LiveMode>('MANUAL'),[showSeconds,setShow]=useState(90),[breakSeconds,setBreak]=useState(30);const lock=useRef(false);
 useEffect(()=>{if(state){setMode(state.mode);setShow(state.showSeconds);setBreak(state.breakSeconds);if(state.videoId)setUrl(previous=>previous||`https://www.youtube.com/live/${state.videoId}`)}},[state?.revision]);
 function check(){try{const id=parseYouTubeId(url);setChecked(id);setMessage('รูปแบบลิงก์ถูกต้อง ยังไม่ได้ยืนยันว่า YouTube กำลัง LIVE')}catch{setChecked(null);setMessage('ลิงก์ YouTube ไม่ถูกต้อง')}}
 async function mutate(action:'save'|'settings'|'start'|'stop'){
  if(lock.current||!state)return;lock.current=true;setBusy(true);setMessage('');try{
   if(action==='save'&&parseYouTubeId(url)!==checked)throw Error('ตรวจลิงก์ก่อนบันทึก');
   const challenge=await fetch('/api/admin/auth/challenge',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({purpose:'mutation'})}).then(r=>r.json());if(!challenge.ok)throw Error('ยืนยันสิทธิ์ไม่สำเร็จ');
   const response=await fetch('/api/admin/live',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Admin-CSRF':challenge.csrfToken},body:JSON.stringify({action,url,mode,showSeconds,breakSeconds,revision:state.revision})});const result=await response.json();if(!response.ok)throw Error(result.error||'บันทึกไม่สำเร็จ');setState(result);setMessage('บันทึกแล้ว');
  }catch(e){setMessage(e instanceof Error?e.message:'ดำเนินการไม่สำเร็จ')}finally{lock.current=false;setBusy(false)}
 }
 const inputDisabled=role==='viewer'||busy;
 const disabled=inputDisabled||!state;
 return <section className="card admin-external-live" aria-label="ตั้งค่า LIVE"><div className="row"><h2>External LIVE</h2><span className={'badge '+(state?.status==='SHOWING'?'green':'orange')}>{state?.status||'OFFLINE'}</span></div><p className="muted">CameraFi ส่งภาพไป YouTube; PAIR LIVE ควบคุมเฉพาะการแสดงภาพให้สมาชิก</p>
 <label>YouTube Live URL<input className="field" type="url" value={url} onChange={e=>{setUrl(e.target.value);setChecked(null)}} disabled={inputDisabled}/></label><div className="camera-controls"><button className="secondary" onClick={check} disabled={inputDisabled}>ตรวจสอบลิงก์</button><button className="secondary" onClick={()=>void mutate('save')} disabled={disabled||!checked}>บันทึก</button></div>
 <label>เวลาแสดง (วินาที)<input className="field" type="number" min="10" max="3600" value={showSeconds} onChange={e=>setShow(Number(e.target.value))} disabled={disabled}/></label><label>เวลาพัก (วินาที)<input className="field" type="number" min="1" max="3600" value={breakSeconds} onChange={e=>setBreak(Number(e.target.value))} disabled={disabled}/></label>
 <label className="setting-row">Auto<input type="checkbox" checked={mode==='AUTO'} onChange={e=>setMode(e.target.checked?'AUTO':'MANUAL')} disabled={disabled}/></label><button className="secondary" onClick={()=>void mutate('settings')} disabled={disabled}>บันทึกเวลาและโหมด</button>
 <div className="camera-controls"><button className="primary" onClick={()=>void mutate('start')} disabled={disabled||!state?.videoId||state.status==='SHOWING'||state.status==='INTERMISSION'}>เริ่มแสดง LIVE</button><button className="secondary" onClick={()=>void mutate('stop')} disabled={disabled||state?.status==='OFFLINE'}>หยุดแสดง LIVE</button></div>
 <div className="external-live-frame">{state?.videoId?<iframe src={embedUrl(state.videoId)} title="ตัวอย่าง YouTube" allow="fullscreen; picture-in-picture" allowFullScreen sandbox="allow-scripts allow-same-origin allow-presentation"/>:<div className="external-live-empty">ยังไม่มีวิดีโอ</div>}</div><p role="status">{message|| (loadError?'โหลดสถานะ LIVE ไม่สำเร็จ: กรอกและตรวจสอบ URL ได้ แต่บันทึกหรือเริ่ม LIVE ต้องเชื่อม LINE OA และโหลดสถานะสำเร็จก่อน':`${state?.status||'OFFLINE'}${seconds?` · ${seconds} วินาที`:''}`)}</p><p className="muted footnote">การซ่อนภาพใน PAIR LIVE ไม่ได้ปิดวิดีโอบน YouTube สำหรับผู้ที่มีลิงก์</p></section>
}

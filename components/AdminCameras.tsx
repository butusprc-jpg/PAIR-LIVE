'use client';
import {useLanguage} from '../lib/LanguageProvider';
import {t,formatNumber} from '../lib/i18n';
import {adminError} from '../lib/admin-display';
import {useEffect,useState} from 'react';
import VdoViewer,{validatedViewerUrl} from '../modules/external-live/client/VdoViewer';
import AdminOcrRoi from './AdminOcrRoi';
import AdminRoundLiveControls from './AdminRoundLiveControls';
import AdminRoundScreenStatus from './AdminRoundScreenStatus';

type Camera={cameraId:string;slot:number;name:string;status:'READY'|'NOT_CONFIGURED';displayEnabled:boolean;revision:number;viewerUrl:string|null};
type State={cameras:Camera[];lineNoticeRecipients:number|null};
const errors:Record<string,string>={camera_conflict:'สถานะกล้องเปลี่ยนจากอีกหน้าจอแล้ว กรุณาลองใหม่',invalid_viewer_url:'URL ต้องเป็น https://vdo.ninja/?view=STREAM_ID เท่านั้น',camera_must_stop_first:'หยุด LIVE ก่อนเปลี่ยน URL',camera_not_configured:'กรุณาบันทึก URL ก่อนเริ่ม LIVE',oa_binding_unverified:'ยังไม่ได้ยืนยันการเชื่อม LINE OA',tenant_binding_missing:'ไม่พบ OA ของบัญชีนี้',admin_forbidden:'ไม่มีสิทธิ์แก้ไขกล้อง'};
export default function AdminCameras({role,mode='viewer'}:{role:'admin'|'operator'|'viewer';mode?:'viewer'|'settings'}){const {locale}=useLanguage();const ui=(key:string,values:Record<string,string|number>={})=>t(key,locale,values);
 const[state,setState]=useState<State|null>(null),[url,setUrl]=useState(''),[dirty,setDirty]=useState(false),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const camera=state?.cameras.find(c=>c.slot===1);
 const saveDisabledReason=role!=='admin'?'ต้องใช้สิทธิ์แอดมินเพื่อบันทึก URL':camera?.displayEnabled?'หยุด LIVE ก่อนเปลี่ยน URL กล้อง':null;
 async function load(){const response=await fetch('/api/admin/cameras',{credentials:'same-origin',cache:'no-store'});const value=await response.json();if(!response.ok)throw Error(value.error||'camera_unavailable');setState(value);if(!dirty)setUrl(value.cameras.find((c:Camera)=>c.slot===1)?.viewerUrl||'');return value as State}
 useEffect(()=>{void load().catch(error=>setMessage(errors[error.message]||'โหลดการตั้งค่ากล้องไม่ได้'))},[]);// eslint-disable-line react-hooks/exhaustive-deps
 async function act(action:'save'|'start'|'stop'){
  if(!camera||busy)return;setBusy(true);setMessage('');
  try{
   if(action==='save'&&!validatedViewerUrl(url)){setMessage(errors.invalid_viewer_url);return}
   const challengeResponse=await fetch('/api/admin/auth/challenge',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({purpose:'mutation'})});const challenge=await challengeResponse.json();if(!challengeResponse.ok||challenge.ok!==true||typeof challenge.csrfToken!=='string')throw Error(challenge.error||'csrf_unavailable');
   const response=await fetch('/api/admin/cameras',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Admin-CSRF':challenge.csrfToken},body:JSON.stringify({target:'primary',cameraId:camera.cameraId,revision:camera.revision,action,url:action==='save'?url:undefined})});const next=await response.json();if(!response.ok)throw Error(next.error||'camera_unavailable');
   // POST returns readCameraSite after the transaction commits. Do not issue a
   // second provisioning GET before acknowledging the committed configuration.
   const savedCamera=next.cameras?.find((c:Camera)=>c.slot===1);
   if(!savedCamera)throw Error('camera_readback_failed');
   if(action==='save'&&savedCamera.viewerUrl!==validatedViewerUrl(url))throw Error('camera_save_not_persisted');
   setState(next);setUrl(savedCamera.viewerUrl||'');
   if(action==='start'&&!savedCamera.displayEnabled)throw Error('camera_publish_not_confirmed');
   if(action==='stop'&&savedCamera.displayEnabled)throw Error('camera_stop_not_confirmed');
   setDirty(false);
   setMessage(action==='save'?ui("บันทึก URL แล้ว · กำลังรอภาพจากกล้อง"):action==='start'?(next.lineNoticeRecipients===0?ui("เปิด LIVE แล้ว แต่ยังไม่มีสมาชิกเปิดรับแจ้งเตือน LINE · สมาชิกต้องเปิดในการตั้งค่า"):ui('admin.camera.lineQueued',{count:next.lineNoticeRecipients??0})):ui("ซ่อนจอ LIVE ของสมาชิกแล้ว"));
   window.dispatchEvent(new Event('pair-live:admin-change'));
  }catch(error){const code=error instanceof Error?error.message:'camera_unavailable';setMessage(errors[code]||(code==='camera_save_not_persisted'?'เซิร์ฟเวอร์รับคำขอแล้ว แต่ตรวจไม่พบ URL ที่บันทึก':code==='camera_readback_failed'?'ตรวจสอบค่าที่บันทึกไม่สำเร็จ':`ดำเนินการไม่สำเร็จ (${code})`));await load().catch(()=>{})}finally{setBusy(false)}
 }
 return <section className="card admin-cameras" aria-label={mode==='viewer'?ui("กล้องหลัก LIVE"):ui("ตั้งค่ากล้อง")}>
  {!state?<p role="status">{message||ui("กำลังโหลดการตั้งค่า...")}</p>:!camera?<p role="alert">{ui("ไม่พบกล้องหลักใน OA นี้")}</p>:mode==='settings'?<>
   <h2>{ui("กล้องหลัก · VDO.Ninja")}</h2>
   <label>{ui("วาง URL VDO.Ninja")}<input className="field" type="url" inputMode="url" autoCapitalize="off" spellCheck={false} value={url} onChange={event=>{setUrl(event.target.value);setDirty(true)}} placeholder="https://vdo.ninja/?view=STREAM_ID" disabled={busy||role!=='admin'}/></label>
   <button className="primary" type="button" disabled={busy||!!saveDisabledReason} onClick={()=>void act('save')}>{ui(busy?"กำลังบันทึก...":"บันทึก URL")}</button>
   {saveDisabledReason&&<p className="muted" role="status">{saveDisabledReason}</p>}
   <div className="camera-controls"><button className="primary" type="button" disabled={busy||role==='viewer'||camera.status!=='READY'||camera.displayEnabled||dirty} onClick={()=>void act('start')}>{ui("เริ่ม LIVE")}</button><button className="secondary" type="button" disabled={busy||role==='viewer'||!camera.displayEnabled} onClick={()=>void act('stop')}>{ui("หยุด LIVE")}</button></div>
   <p role="status">{camera.displayEnabled?ui("เผยแพร่ภาพให้สมาชิกแล้ว"):ui("ยังไม่เผยแพร่ภาพให้สมาชิก")}</p>
   <h3>{ui("ภาพกล้อง")}</h3>
   {camera.viewerUrl?<VdoViewer key={camera.viewerUrl} url={camera.viewerUrl} label={ui('ภาพกล้องหลัก')}/>:<div className="external-live-frame"><div className="external-live-empty">{ui("ยังไม่ตั้งค่า URL")}</div></div>}
      <details><summary>{ui("ตรวจอ่านตัวเลขจากกล้อง")}</summary><AdminOcrRoi cameraId={camera.cameraId} canEdit={role==='admin'}/></details>
  </>:<>
   <h2>{ui("ภาพกล้อง")}</h2>
   <div className="admin-camera-stage">{camera.viewerUrl?<VdoViewer key={camera.viewerUrl} url={camera.viewerUrl} label={ui('ภาพกล้องหลัก')}/>:<div className="external-live-frame"><div className="external-live-empty">{ui("ยังไม่ตั้งค่า URL")}</div></div>}<AdminRoundScreenStatus/></div>
   <p role="status">{camera.displayEnabled?ui("เผยแพร่ภาพให้สมาชิกแล้ว"):ui("ยังไม่เผยแพร่ภาพให้สมาชิก")}</p>
   <div className="camera-controls"><button className="primary" type="button" disabled={busy||role==='viewer'||camera.status!=='READY'||camera.displayEnabled||dirty} onClick={()=>void act('start')}>{ui("เริ่ม LIVE")}</button><button className="secondary" type="button" disabled={busy||role==='viewer'||!camera.displayEnabled} onClick={()=>void act('stop')}>{ui("หยุด LIVE")}</button></div>
   <AdminRoundLiveControls role={role} compact/>
  </>}
  {message&&state&&<p role="status">{adminError(message,locale)}</p>}
 </section>
}

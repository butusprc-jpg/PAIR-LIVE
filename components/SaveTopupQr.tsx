'use client';
import {useEffect,useRef,useState} from 'react';

const qrUrl='/api/member/topup-qr';
type Props={version:number};
function extension(type:string){return type==='image/png'?'png':type==='image/webp'?'webp':'jpg'}

/**
 * A LIFF page is a browser WebView, not a native app: it cannot write
 * directly into Photos/Gallery. Trigger the system share sheet on both
 * Android and iOS when available; otherwise request an HTTP download.
 * No enlarged image or long-press flow.
 */
export function SaveTopupQr({version}:Props){
 const [message,setMessage]=useState('');
 const [file,setFile]=useState<File|null>(null);
 const url=qrUrl+'?download=1&v='+version;
 const linkRef=useRef<HTMLAnchorElement>(null);
 useEffect(()=>{
  let active=true;
  setFile(null);
  fetch(qrUrl+'?v='+version,{credentials:'same-origin',cache:'no-store'})
   .then(async response=>{if(!response.ok)throw new Error('qr_fetch_failed');return response.blob()})
   .then(blob=>{if(active&&blob.size>0&&['image/png','image/jpeg','image/webp'].includes(blob.type))setFile(new File([blob],'PAIR-LIVE-QR.'+extension(blob.type),{type:blob.type}))})
   .catch(()=>{});
  return()=>{active=false};
 },[version]);
 function save(){
  setMessage('');
  // Web Share must be called immediately in the click handler.
  // On supported iOS/Android browsers this offers system actions, possibly including Save Image.
  if(file&&typeof navigator.share==='function'&&navigator.canShare?.({files:[file]})){
   void navigator.share({files:[file],title:'PAIR LIVE QR'}).then(()=>{
    setMessage('ส่งภาพให้ระบบแชร์ของมือถือแล้ว โปรดเลือกบันทึกภาพ');
   }).catch((e:unknown)=>{
    if(e instanceof Error&&e.name==='AbortError')return;
    linkRef.current?.click();
    setMessage('เมนูแชร์ใช้ไม่ได้ ระบบได้ลองส่งไฟล์ดาวน์โหลด โปรดตรวจรายการดาวน์โหลด');
   });
   return;
  }
  // Unsupported WebViews and desktop: direct authenticated HTTP attachment.
  // This may go to Downloads and cannot guarantee a Gallery save.
  linkRef.current?.click();
  setMessage('ส่งคำสั่งดาวน์โหลดแล้ว หากเปิดผ่าน LINE และยังไม่มีไฟล์ ต้องใช้เบราว์เซอร์ภายนอก');
 }
 return <div>
  <button className="secondary" type="button" onClick={save}>SAVE QR CODE</button>
  <a ref={linkRef} href={url} download="PAIR-LIVE-QR" style={{display:'none'}} aria-hidden="true" tabIndex={-1}>Download QR</a>
  {message&&<p role="status">{message}</p>}
 </div>;
}

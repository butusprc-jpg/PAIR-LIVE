'use client';
import {useEffect,useRef,useState} from 'react';

const qrUrl='/api/member/topup-qr';
type Props={version:number};
function onIOS(){return /iPad|iPhone|iPod/i.test(navigator.userAgent)}
function extension(type:string){return type==='image/png'?'png':type==='image/webp'?'webp':'jpg'}

/**
 * A LIFF page is a browser WebView, not a native app: it cannot write
 * directly into Photos/Gallery. Trigger the system share sheet where
 * file sharing is available; otherwise request a real HTTP download.
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
  // On iOS this offers system actions, possibly including Save Image.
  if(onIOS()&&file&&typeof navigator.share==='function'&&navigator.canShare?.({files:[file]})){
   void navigator.share({files:[file],title:'PAIR LIVE QR'}).catch((e:unknown)=>{
    if(e instanceof Error&&e.name==='AbortError')return;
    linkRef.current?.click();
    setMessage('ส่งคำสั่งดาวน์โหลดแล้ว โปรดตรวจแอปไฟล์หรือรายการดาวน์โหลด');
   });
   return;
  }
  // Android and desktop: direct authenticated HTTP attachment (not blob:).
  // Android's Download Manager may save to Downloads, not Gallery.
  linkRef.current?.click();
  setMessage('ส่งคำสั่งดาวน์โหลดแล้ว ตรวจโฟลเดอร์ Downloads ของเครื่อง');
 }
 return <div>
  <button className="secondary" type="button" onClick={save}>SAVE QR CODE</button>
  <a ref={linkRef} href={url} download="PAIR-LIVE-QR" style={{display:'none'}} aria-hidden="true" tabIndex={-1}>Download QR</a>
  {message&&<p role="status">{message}</p>}
 </div>;
}

'use client';
import {useState} from 'react';
import {isLineWebView} from '../lib/topup/qr-navigation';
import {initLIFF} from '../lib/liff';
export function SaveTopupQr({version:_version}:{version:number}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function openQR(){
  if(busy)return;setBusy(true);setMessage('');
  try{
   // Generate a new signed URL on each tap; no stale preloaded link.
   const response=await fetch('/api/member/topup-qr/external-link',{cache:'no-store',credentials:'same-origin'});
   if(!response.ok)throw new Error('qr_link_unavailable');
   const result=await response.json();
   if(typeof result.url!=='string'||!result.url.startsWith(window.location.origin+'/api/member/topup-qr/external-image?'))throw new Error('invalid_qr_link');
   if(isLineWebView(navigator.userAgent)){
    const auth=await initLIFF();
    if(!auth)return;
    auth.client.openWindow({url:result.url,external:true});
    setMessage('หากภาพยังอยู่ใน LINE ให้เลือกเมนู ⋯ แล้วเปิดในเบราว์เซอร์ภายนอก');
   }else window.location.assign(result.url);
  }catch{setMessage('เปิด QR ไม่สำเร็จ กรุณาลองใหม่')}
  finally{setBusy(false)}
 }
 return <div><button className="secondary" type="button" onClick={()=>void openQR()} disabled={busy}>{busy?'กำลังเปิด QR...':'เปิด QR เติมแต้ม'}</button>{message&&<p role="status">{message}</p>}</div>;
}

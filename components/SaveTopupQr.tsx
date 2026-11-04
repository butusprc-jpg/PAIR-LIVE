'use client';
import {useCallback,useEffect,useState} from 'react';
import type {MouseEvent} from 'react';
import liff from '@line/liff';

// LINE's WebView may suppress the long-press image menu. On mobile provide
// a short-lived, signed image URL to open in the external browser.
// No modal, duplicate enlarged image, or unreliable blob download.
export function SaveTopupQr({version}:{version:number}){
 const [mobile,setMobile]=useState(false);
 const [link,setLink]=useState('');
 const [message,setMessage]=useState('');
 const load=useCallback(async()=>{
  try{
   const response=await fetch('/api/member/topup-qr/external-link',{cache:'no-store',credentials:'same-origin'});
   if(!response.ok)throw new Error('qr_link_unavailable');
   const result=await response.json();
   if(typeof result.url!=='string'||!result.url.startsWith(window.location.origin+'/api/member/topup-qr/external-image?'))throw new Error('invalid_qr_link');
   setLink(result.url);setMessage('');
  }catch{setLink('');setMessage('เตรียมลิงก์บันทึกภาพไม่ได้ กรุณาลองใหม่')}
 },[]);
 useEffect(()=>{
  const found=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  setMobile(found);if(found)void load();
 },[load,version]);
 function openBrowser(event:MouseEvent<HTMLAnchorElement>){
  if(!link){event.preventDefault();return}
  if(/Line\//i.test(navigator.userAgent)){
   try{
    if(liff.isInClient()){
     event.preventDefault();
     liff.openWindow({url:link,external:true});
    }
   }catch{/* Use the normal browser link if LIFF external navigation fails. */}
  }
 }
 return <div>
  <p className="muted">แตะค้างที่ภาพ QR Code เพื่อบันทึกรูปภาพ</p>
  {mobile&&<>
   <a className="secondary" href={link||'#'} target="_blank" rel="noopener noreferrer" onClick={openBrowser} style={{display:'inline-block',marginBottom:12}}>เปิด QR ในเบราว์เซอร์เพื่อบันทึก</a>
   {message&&<p role="status">{message}</p>}
   {!link&&<button className="secondary" type="button" onClick={()=>void load()}>ลองเปิด QR อีกครั้ง</button>}
  </>}
 </div>;
}

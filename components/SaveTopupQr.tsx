'use client';
import {useCallback,useEffect,useState} from 'react';
import liff from '@line/liff';
import {isLineWebView} from '../lib/topup/qr-navigation';

let liffReady:Promise<void>|undefined;
function readyLiff(){
 if(!liffReady){
  const liffId=process.env.NEXT_PUBLIC_LINE_LIFF_ID;
  if(!liffId)return Promise.reject(new Error('liff_not_configured'));
  // Existing member sessions can skip loginLine(), so initialize here too.
  liffReady=liff.init({liffId}).then(()=>{}).catch(error=>{liffReady=undefined;throw error});
 }
 return liffReady;
}
export function SaveTopupQr({version}:{version:number}){
 const [mobile,setMobile]=useState(false);
 const [link,setLink]=useState('');
 const [initialized,setInitialized]=useState(false);
 const [message,setMessage]=useState('');
 const load=useCallback(async()=>{
  try{
   const r=await fetch('/api/member/topup-qr/external-link',{credentials:'same-origin',cache:'no-store'});
   if(!r.ok)throw new Error('qr_link_unavailable');
   const result=await r.json();
   if(typeof result.url!=='string'||!result.url.startsWith(window.location.origin+'/api/member/topup-qr/external-image?'))throw new Error('invalid_link');
   setLink(result.url);
  }catch{setLink('');setMessage('ไม่สามารถเตรียมลิงก์ภาพ QR ได้')}
 },[]);
 useEffect(()=>{
  let mounted=true;
  const onMobile=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  setMobile(onMobile);
  if(onMobile)void load();
  if(isLineWebView(navigator.userAgent)){
   void readyLiff().then(()=>{if(mounted)setInitialized(true)}).catch(()=>{if(mounted)setMessage('LINE ไม่สามารถเริ่มระบบเปิดเบราว์เซอร์ได้')});
  }
  return()=>{mounted=false};
 },[load,version]);
 function openExternal(){
  if(!link)return;
  if(isLineWebView(navigator.userAgent)){
   if(!initialized){setMessage('กำลังเชื่อมต่อ LINE กรุณากดอีกครั้ง');return}
   // Important: LINE's in-app browser may have isInClient() === false.
   // Always request external navigation for all LINE WebView types.
   try{liff.openWindow({url:link,external:true});setMessage('หากยังอยู่ใน LINE ให้ใช้เมนู ⋯ แล้วเลือกเปิดในเบราว์เซอร์ภายนอก')}
   catch{setMessage('LINE เปิดเบราว์เซอร์ไม่ได้ ให้ใช้เมนู ⋯ → เปิดในเบราว์เซอร์ภายนอก')}
   return;
  }
  // Non-LINE mobile browser: follow the signed image URL directly.
  window.location.assign(link);
 }
 return <div>
  <p className="muted">หากมือถือบันทึกภาพไม่ได้ ให้เปิด QR ในเบราว์เซอร์แล้วแตะค้างบันทึก</p>
  {mobile&&<button className="secondary" type="button" onClick={openExternal} disabled={!link} style={{marginBottom:12}}>เปิด QR เพื่อบันทึกในมือถือ</button>}
  {mobile&&isLineWebView(typeof navigator==='undefined'?'':navigator.userAgent)&&!initialized&&<p className="muted">กำลังเตรียมการเปิดเบราว์เซอร์</p>}
  {message&&<p role="status">{message}</p>}
  {!link&&mobile&&<button className="secondary" type="button" onClick={()=>void load()}>ลองใหม่</button>}
 </div>;
}

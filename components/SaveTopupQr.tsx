'use client';
import {useEffect,useRef,useState} from 'react';

const qrUrl='/api/member/topup-qr';
type Props={version:number};

function isMobile(){return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)}
function imageExtension(type:string){return type==='image/png'?'png':type==='image/webp'?'webp':'jpg'}

export function SaveTopupQr({version}:Props){
 const [busy,setBusy]=useState(false);
 const [preview,setPreview]=useState<string|null>(null);
 const [message,setMessage]=useState('');
 const lock=useRef(false);
 const objectUrl=useRef<string|null>(null);
 useEffect(()=>()=>{if(objectUrl.current)URL.revokeObjectURL(objectUrl.current)},[]);
 function close(){setPreview(null);if(objectUrl.current){URL.revokeObjectURL(objectUrl.current);objectUrl.current=null}}
 function openPreview(blob:Blob){if(objectUrl.current)URL.revokeObjectURL(objectUrl.current);objectUrl.current=URL.createObjectURL(blob);setPreview(objectUrl.current)}
 async function save(){
  if(lock.current)return;
  lock.current=true;setBusy(true);setMessage('');
  try{
   const result=await fetch(qrUrl+'?v='+version,{credentials:'same-origin',cache:'no-store'});
   if(!result.ok)throw Error(result.status===401?'กรุณาเข้าสู่ระบบ LINE ก่อน':'โหลดภาพ QR ไม่สำเร็จ ('+result.status+')');
   const blob=await result.blob();
   if(!['image/png','image/jpeg','image/webp'].includes(blob.type)||blob.size<1)throw Error('ไฟล์ภาพ QR ไม่ถูกต้อง');
   const file=new File([blob],'PAIR-LIVE-QR.'+imageExtension(blob.type),{type:blob.type});
   if(isMobile()&&typeof navigator.share==='function'&&navigator.canShare?.({files:[file]})){
    try{await navigator.share({files:[file],title:'PAIR LIVE QR Code'});setMessage('เลือกบันทึกภาพหรือแชร์จากเมนูของมือถือ');return}
    catch(e){if(e instanceof DOMException&&e.name==='AbortError'){setMessage('ยกเลิกการแชร์แล้ว');return}}
   }
   // Desktop browsers support a direct image download. A mobile WebView might
   // block programmatic downloads, so always offer a long-press fallback.
   const link=document.createElement('a');const url=URL.createObjectURL(blob);
   link.href=url;link.download=file.name;link.style.display='none';document.body.appendChild(link);link.click();link.remove();
   window.setTimeout(()=>URL.revokeObjectURL(url),60000);
   if(isMobile()){openPreview(blob);setMessage('หากภาพไม่ถูกบันทึก ให้แตะค้างที่ภาพแล้วเลือกบันทึกภาพ')}
   else setMessage('ส่งคำสั่งดาวน์โหลดแล้ว ตรวจไฟล์ในโฟลเดอร์ Downloads');
  }catch(error){setMessage(error instanceof Error?error.message:'ไม่สามารถบันทึก QR ได้')}
  finally{lock.current=false;setBusy(false)}
 }
 return <div>
  <button className="secondary" type="button" onClick={save} disabled={busy}>
   {busy?'กำลังเตรียมภาพ…':'SAVE QR CODE'}
  </button>
  {message&&<p role="status">{message}</p>}
  {preview&&<div className="card" role="dialog" aria-label="บันทึกภาพ QR Code">
   <p><b>บันทึกภาพ QR Code</b></p>
   <p>บน LINE ให้แตะค้างที่ภาพ แล้วเลือกบันทึกรูปภาพ / Save Image</p>
   <img src={preview} alt="QR Code สำหรับแตะค้างเพื่อบันทึก" style={{width:'100%',maxWidth:360,display:'block',margin:'12px auto'}}/>
   <p><a className="secondary" href={qrUrl+'?download=1'}>เปิดไฟล์ QR เพื่อบันทึก</a></p>
   <button type="button" className="secondary" onClick={close}>ปิด</button>
  </div>}
 </div>;
}

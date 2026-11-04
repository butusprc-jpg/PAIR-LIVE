'use client';
import {useEffect,useRef,useState} from 'react';

const qrUrl='/api/member/topup-qr';
type Props={version:number};
function isMobile(){return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)}
function extension(type:string){return type==='image/png'?'png':type==='image/webp'?'webp':'jpg'}

export function SaveTopupQr({version}:Props){
 const [ready,setReady]=useState(false);
 const [busy,setBusy]=useState(false);
 const [showImage,setShowImage]=useState(false);
 const [message,setMessage]=useState('');
 const fileRef=useRef<File|null>(null);
 const lock=useRef(false);
 const imageUrl=qrUrl+'?v='+encodeURIComponent(version.toString());
 useEffect(()=>{
  let cancelled=false;
  fileRef.current=null;
  setReady(false);
  fetch(imageUrl,{credentials:'same-origin',cache:'no-store'}).then(async result=>{
   if(!result.ok)throw new Error('qr_fetch_'+result.status);
   const blob=await result.blob();
   if(!['image/png','image/jpeg','image/webp'].includes(blob.type)||!blob.size)throw new Error('qr_image_invalid');
   if(!cancelled){fileRef.current=new File([blob],'PAIR-LIVE-QR.'+extension(blob.type),{type:blob.type});setReady(true)}
  }).catch(()=>{if(!cancelled)setMessage('ยังโหลดภาพไม่ได้ กรุณาลองใหม่')});
  return()=>{cancelled=true;fileRef.current=null};
 },[imageUrl]);
 function save(){
  if(lock.current)return;
  lock.current=true;setBusy(true);setMessage('');
  try{
   const file=fileRef.current;
   if(file&&isMobile()&&typeof navigator.share==='function'&&navigator.canShare?.({files:[file]})){
    // Call share from the user gesture, without awaiting fetch first.
    void navigator.share({files:[file],title:'PAIR LIVE QR Code'}).then(()=>{
     setMessage('ส่งภาพไปยังเมนูแชร์แล้ว เลือกบันทึกภาพจากเมนูของเครื่อง');
    }).catch((error:unknown)=>{
     if(error instanceof Error&&error.name==='AbortError')setMessage('ยกเลิกการแชร์');
     else{setShowImage(true);setMessage('ใช้วิธีแตะค้างที่ภาพเพื่อบันทึกแทน')}
    }).finally(()=>{lock.current=false;setBusy(false)});
    return;
   }
   if(!isMobile()){
    // Direct server download, not a blob: URL.
    const a=document.createElement('a');a.href=qrUrl+'?download=1&v='+version;a.download='PAIR-LIVE-QR';document.body.appendChild(a);a.click();a.remove();
    setMessage('ส่งไฟล์ไปยังระบบดาวน์โหลดแล้ว');
   }else{
    setShowImage(true);
    setMessage('แตะค้างที่ภาพ QR แล้วเลือก บันทึกรูปภาพ หรือเปิดไฟล์เต็มจอ');
   }
  }catch{setShowImage(true);setMessage('ไม่สามารถเรียกเมนูดาวน์โหลดได้ ใช้ภาพเต็มจอแทน')}
  lock.current=false;setBusy(false);
 }
 return <div>
  <button className="secondary" type="button" disabled={busy} onClick={save}>{busy?'กำลังเปิดเมนูบันทึก…':'SAVE QR CODE'}</button>
  {!ready&&<p>กำลังเตรียมไฟล์ภาพสำหรับบันทึก</p>}
  {message&&<p role="status">{message}</p>}
  {showImage&&<div className="card" role="dialog" aria-label="บันทึก QR Code">
   <p><b>บันทึก QR Code ลงมือถือ</b></p>
   <p>แตะค้างที่ภาพเพื่อเลือก บันทึกรูปภาพ (Save Image) หาก LINE ไม่แสดงเมนู ให้กดเปิดภาพเต็มจอ</p>
   <a href={imageUrl} target="_blank" rel="noopener noreferrer" aria-label="เปิด QR เต็มจอ">
    <img src={imageUrl} alt="QR Code สำหรับแตะค้างบันทึก" style={{display:'block',width:'100%',maxWidth:360,margin:'12px auto'}}/>
   </a>
   <p><a className="secondary" href={imageUrl} target="_blank" rel="noopener noreferrer">เปิดภาพเต็มจอ</a></p>
   <p><a className="secondary" href={qrUrl+'?download=1&v='+version}>ดาวน์โหลดไฟล์ QR</a></p>
   <button className="secondary" type="button" onClick={()=>setShowImage(false)}>ปิด</button>
  </div>}
 </div>;
}

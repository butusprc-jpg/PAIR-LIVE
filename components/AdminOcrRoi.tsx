'use client';
import {useEffect,useState} from 'react';

type Result={status:'READ'|'GUESS'|'REVIEW_REQUIRED';number?:string;lastDigit?:string;parity?:'EVEN'|'ODD';confidence?:number;rawText?:string;reason?:string;roi?:{x:number;y:number;width:number;height:number}|null;image:string;imageWidth:number;imageHeight:number;capturedAt:string};
export default function AdminOcrRoi({cameraId}:{cameraId:string;canEdit:boolean}){
 const [busy,setBusy]=useState(false),[remaining,setRemaining]=useState(0),[result,setResult]=useState<Result|null>(null),[message,setMessage]=useState('');
 useEffect(()=>{if(!busy||remaining<=0)return;const timer=setTimeout(()=>setRemaining(value=>Math.max(0,value-1)),1000);return()=>clearTimeout(timer)},[busy,remaining]);
 useEffect(()=>{setResult(null);setMessage('')},[cameraId]);
 async function simulate(){if(busy)return;setBusy(true);setRemaining(3);setMessage('');setResult(null);try{
  const challengeResponse=await fetch('/api/admin/auth/challenge',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({purpose:'mutation'})});
  const challenge=await challengeResponse.json();if(!challengeResponse.ok)throw Error('csrf_unavailable');
  const response=await fetch('/api/admin/ocr-roi/simulate',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Admin-CSRF':challenge.csrfToken},body:JSON.stringify({cameraId})});
  const data=await response.json();if(!response.ok)throw Error(data.error||'ocr_simulation_unavailable');setResult(data);
 }catch(error){setMessage(error instanceof Error?error.message:'อ่าน OCR ไม่สำเร็จ')}finally{setBusy(false);setRemaining(0)}}
 return <div className="admin-ocr-roi"><h3>อ่านตัวเลขอัตโนมัติ</h3><p className="muted">จำลองหยุดรอบ รอ 3 วินาที แล้วจับภาพกล้องหนึ่งเฟรมเพื่อหาเลขและอ่าน OCR โดยไม่สร้างรอบหรือจ่ายแต้ม</p><button className="primary" type="button" disabled={busy} onClick={()=>void simulate()}>จำลองหยุดรอบและอ่าน OCR</button><p role="status">{busy?(remaining>0?`รอให้ตัวเลขหยุด ${remaining} วินาที`:'กำลังจับภาพและอ่าน OCR'):result?.status==='READ'?`${result.number} → เลขท้าย ${result.lastDigit} → ${result.parity==='EVEN'?'คู่':'คี่'} · ความมั่นใจ ${Math.round(result.confidence||0)}%`:result?.status==='GUESS'?`ผลทายทดลอง (มั่นใจมากกว่า 60%): OCR พบ ${result.number} → เลขท้าย ${result.lastDigit} → ${result.parity==='EVEN'?'คู่':'คี่'} · ความมั่นใจ ${Math.round(result.confidence||0)}% · ${result.reason==='preview_only_conflicting_results'?'OCR หลายวิธีอ่านไม่ตรงกัน':'จุดทศนิยมยังไม่ยืนยัน'} · ไม่ใช้ตัดสินหรือจ่ายแต้ม`:result?`ต้องตรวจสอบ: ${result.reason} · OCR ดิบ: ${result.rawText||'(ว่าง)'} · ความมั่นใจ ${Math.round(result.confidence||0)}%`:''}</p>{result?.rawText&&<p>OCR ดิบ: {result.rawText}</p>}{result?.image&&<div className="ocr-roi-image"><img src={result.image} alt="ภาพกล้องที่จับหลังจำลองหยุดรอบ"/>{result.roi&&<div className="ocr-roi-box" style={{left:`${result.roi.x/result.imageWidth*100}%`,top:`${result.roi.y/result.imageHeight*100}%`,width:`${result.roi.width/result.imageWidth*100}%`,height:`${result.roi.height/result.imageHeight*100}%`}}/>}</div>}{message&&<p role="alert">{message}</p>}</div>;
}

'use client';
import {useEffect,useState} from 'react';

type Round={id:string;status:string;closesAt:string};
type RoundResponse={round:Round|null;serverTime:string};

/** Lightweight read-only overlay: never mutates a round or controls the camera. */
export default function AdminRoundScreenStatus(){
 const [round,setRound]=useState<Round|null>(null);
 const [offset,setOffset]=useState(0);
 const [now,setNow]=useState(Date.now());
 const [loaded,setLoaded]=useState(false);
 useEffect(()=>{
  let active=true;
  const refresh=async()=>{
   try{
    const requestedAt=Date.now();
    const response=await fetch('/api/admin/round/current',{cache:'no-store',credentials:'same-origin'});
    if(!response.ok)return;
    const data=await response.json() as RoundResponse;
    if(!active)return;
    setRound(data.round);
    const serverNow=Date.parse(data.serverTime);
    if(Number.isFinite(serverNow))setOffset(serverNow-(requestedAt+Date.now())/2);
    setLoaded(true);
   }catch{/* Preserve last known display during transient network errors. */}
  };
  void refresh();
  const polling=window.setInterval(()=>void refresh(),5000);
  const clock=window.setInterval(()=>setNow(Date.now()),250);
  const onChange=()=>void refresh();
  window.addEventListener('pair-live:admin-change',onChange);
  return()=>{active=false;window.clearInterval(polling);window.clearInterval(clock);window.removeEventListener('pair-live:admin-change',onChange)};
 },[]);
 const active=round?.status==='OPEN';
 const seconds=active?Math.max(0,Math.ceil((Date.parse(round.closesAt)-(now+offset))/1000)):0;
 const clock=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
 const status=round?.status==='OPEN'?'เปิดรับ':round?.status==='CLOSED'?'ปิดรับ':round?.status==='SCANNING'?'กำลังอ่านผล':round?.status==='REVIEW_REQUIRED'?'รอตรวจผล':round?.status==='SETTLED'?'จบรอบ':round?.status||'ไม่มีรอบ';
 return <div className="admin-screen-round-overlay" role="status" aria-label="รอบปัจจุบันและเวลาคงเหลือ">
  <div className="admin-screen-round-chip">รอบ <strong>{loaded&&round?`#${round.id}`:'—'}</strong><span>{loaded?status:'กำลังโหลด'}</span></div>
  <div className="admin-screen-round-chip admin-screen-round-timer"><span>เวลาคงเหลือ</span><strong>{active?clock:'--:--'}</strong></div>
 </div>;
}

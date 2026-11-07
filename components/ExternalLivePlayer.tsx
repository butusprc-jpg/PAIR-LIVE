'use client';
import {useEffect,useState} from 'react';
import type {ExternalLiveState} from '../lib/external-live';
export default function ExternalLivePlayer(){
 const[state,setState]=useState<Pick<ExternalLiveState,'status'|'embedUrl'|'provider'>|null>(null),[failed,setFailed]=useState(false),[error,setError]=useState(false);
 useEffect(()=>{let active=true;async function refresh(){try{const response=await fetch('/api/live',{cache:'no-store'});if(!response.ok)throw new Error();const next=await response.json();if(active){setState(next);setError(false)}}catch{if(active)setError(true)}}void refresh();const timer=setInterval(refresh,5000);const onReturn=()=>{if(document.visibilityState==='visible')void refresh()};document.addEventListener('visibilitychange',onReturn);return()=>{active=false;clearInterval(timer);document.removeEventListener('visibilitychange',onReturn)}},[]);
 useEffect(()=>setFailed(false),[state?.embedUrl]);
 return <div className="external-live-frame" aria-label="จอถ่ายทอดสด">{!error&&state?.status==='LIVE'&&state.embedUrl&&!failed?<iframe key={state.embedUrl} src={state.embedUrl} title="PAIR LIVE" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen referrerPolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-presentation" onError={()=>setFailed(true)}/>:<div className="external-live-empty" role="status">{error?'ไม่สามารถโหลดสถานะ LIVE ได้':failed?'เครื่องเล่นนี้ไม่รองรับในเบราว์เซอร์หรือ LINE กรุณาตรวจสอบลิงก์ LIVE':state?'ยังไม่มี LIVE':'กำลังโหลด LIVE...'}</div>}</div>
}

'use client';
import React,{useEffect,useRef,useState} from 'react';
import {Settings} from 'lucide-react';
import {adminNavigationStatus,type AdminNavigationStatus} from '../lib/client/admin-navigation';

export function AdminSettingsLink(){
 const[status,setStatus]=useState<AdminNavigationStatus>('unauthenticated'),[busy,setBusy]=useState(false);
 const[returned,setReturned]=useState(false);
 const sequence=useRef(0);
 useEffect(()=>{
  let active=true;
  setReturned(new URLSearchParams(window.location.search).has('adminReturn'));
  const verify=()=>{if(document.visibilityState==='hidden')return;const current=++sequence.current;void adminNavigationStatus().then(value=>{if(active&&current===sequence.current)setStatus(value)})};
  verify();document.addEventListener('visibilitychange',verify);window.addEventListener('pageshow',verify);window.addEventListener('focus',verify);
  return()=>{active=false;sequence.current++;document.removeEventListener('visibilitychange',verify);window.removeEventListener('pageshow',verify);window.removeEventListener('focus',verify)};
 },[]);
 const retry=()=>{const current=++sequence.current;void adminNavigationStatus().then(value=>{if(current===sequence.current)setStatus(value)})};
 return <>{status==='allowed'&&<button className="iconbtn" type="button" aria-label="เปิดแดชบอร์ดแอดมิน" disabled={busy} onClick={async()=>{
  if(busy)return;setBusy(true);
  const latest=await adminNavigationStatus();
  if(latest==='allowed')window.location.assign('/admin');
  else{setStatus(latest);setBusy(false)}
 }}><Settings size={19}/></button>}
 {(status==='unavailable'||returned&&status==='unauthenticated')&&<span role="status" className="admin-nav-status">{status==='unavailable'?'ตรวจสิทธิ์แอดมินไม่ได้':'เซสชันแอดมินหมดอายุ'} <button type="button" onClick={retry}>ลองใหม่</button></span>}
 </>;
}

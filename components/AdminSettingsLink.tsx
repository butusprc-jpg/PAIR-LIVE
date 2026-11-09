'use client';
import {useEffect,useState} from 'react';
import {Settings} from 'lucide-react';
import {canOpenAdmin} from '../lib/client/admin-navigation';

export function AdminSettingsLink(){
 const[allowed,setAllowed]=useState(false),[busy,setBusy]=useState(false);
 useEffect(()=>{
  let active=true;
  const verify=()=>{if(document.visibilityState==='visible')void canOpenAdmin().then(value=>{if(active)setAllowed(value)})};
  verify();document.addEventListener('visibilitychange',verify);
  return()=>{active=false;document.removeEventListener('visibilitychange',verify)};
 },[]);
 if(!allowed)return null;
 return <button className="iconbtn" type="button" aria-label="เปิดแดชบอร์ดแอดมิน" disabled={busy} onClick={async()=>{
  if(busy)return;setBusy(true);
  if(await canOpenAdmin())window.location.assign('/admin');
  else{setAllowed(false);setBusy(false)}
 }}><Settings size={19}/></button>;
}

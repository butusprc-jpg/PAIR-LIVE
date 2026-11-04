'use client';
import {useEffect,useState} from 'react';
import {initLIFF} from '../lib/liff';
import {adminRequest,challenge,clientError} from '../modules/admin-auth/client/http';

export function AdminEntry(){
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(true);
 async function enter(){
  setBusy(true);setError('');
  try{
   // Do authentication in LIFF's original entry URL, not after leaving LIFF.
   const existing=await fetch('/api/admin/auth/session',{credentials:'same-origin',cache:'no-store'});
   const session=await existing.json().catch(()=>({ok:false}));
   if(existing.ok&&session.ok===true){window.location.replace('/admin');return}
   const login=await initLIFF();
   if(!login)return; // LIFF is redirecting for login.
   const csrf=await challenge('/api/admin/auth/challenge','login');
   const response=await adminRequest('/api/admin/auth/login',{method:'POST',headers:{'Content-Type':'application/json','X-Admin-CSRF':csrf},body:JSON.stringify({accessToken:login.accessToken})});
   if(!response.session)throw new Error('session_invalid');
   window.location.replace('/admin');
  }catch(err){setError(clientError(err).message+' ('+(err instanceof Error?err.message:'request_failed')+')')}
  finally{setBusy(false)}
 }
 useEffect(()=>{void enter()},[]);
 return <div className="app auth-screen"><section className="card" style={{maxWidth:440,width:'100%'}}>
  <h1>PAIR LIVE · ADMIN</h1>
  {busy?<p role="status">กำลังตรวจสิทธิ์บัญชี LINE ผู้ดูแล...</p>:error?<><p role="alert">{error}</p><button className="primary" type="button" onClick={()=>void enter()}>ลองเข้าสู่ระบบแอดมินอีกครั้ง</button></>:<p>กำลังเปิดหน้าแอดมิน...</p>}
  <p className="muted">เฉพาะบัญชี LINE ที่ได้รับสิทธิ์แอดมินเท่านั้น</p>
 </section></div>;
}

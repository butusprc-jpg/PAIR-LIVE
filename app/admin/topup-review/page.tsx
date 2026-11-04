'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {AdminLogin} from '../../../modules/admin-auth/client';
type Row={id:string;display_name:string;requested_points:number;status:string;has_slip?:boolean};
export default function TopupReviewPage(){
 const [id,setId]=useState(''),[session,setSession]=useState(false),[row,setRow]=useState<Row|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[loading,setLoading]=useState(true);
 const lock=useRef(false);
 const load=useCallback(async(requestId:string)=>{
  const response=await fetch('/api/admin/topups?search='+encodeURIComponent(requestId),{cache:'no-store',credentials:'same-origin'});
  if(!response.ok)throw new Error('โหลดสถานะไม่สำเร็จ');
  const body=await response.json();const current=(body.requests as Row[]).find(r=>r.id===requestId);
  if(!current)throw new Error('ไม่พบคำขอ');setRow(current);return current;
 },[]);
 useEffect(()=>{const requestId=new URLSearchParams(location.search).get('id')||'';setId(requestId);
  fetch('/api/admin/session',{cache:'no-store',credentials:'same-origin'}).then(r=>r.json()).then(async data=>{if(data.ok&&data.session?.admin?.role==='admin'){setSession(true);await load(requestId)}}).catch(e=>setMessage(e.message)).finally(()=>setLoading(false));
 },[load]);
 useEffect(()=>{if(!session||!id)return;const refresh=()=>load(id).catch(()=>{});window.addEventListener('focus',refresh);const timer=setInterval(refresh,10000);return()=>{window.removeEventListener('focus',refresh);clearInterval(timer)}},[session,id,load]);
 async function approve(){
  if(lock.current||!row||row.status!=='PENDING')return;lock.current=true;setBusy(true);setMessage('');
  try{
   const latest=await load(row.id);if(latest.status!=='PENDING'){setMessage('รายการนี้อนุมัติแล้ว');return}
   const challenge=await fetch('/api/admin/auth/challenge',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({purpose:'mutation'})}).then(r=>r.json());
   if(!challenge.ok)throw new Error('ตรวจสิทธิ์ไม่สำเร็จ');
   const response=await fetch('/api/admin/topups',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Admin-CSRF':challenge.csrfToken},body:JSON.stringify({id:row.id,action:'APPROVED',evidenceReviewed:true,note:'LINE admin reviewed slip'})});
   const body=await response.json();if(!response.ok)throw new Error(body.error||'อนุมัติไม่สำเร็จ');
   await load(row.id);setMessage(body.adminLineDelivered?'อนุมัติแล้ว สมาชิกได้รับแต้ม':'อนุมัติแล้ว สมาชิกได้รับแต้ม แต่ส่งข้อความหาแอดมินไม่สำเร็จ');
  }catch(e){let latest:Row|null=null;try{latest=await load(row.id)}catch{}setMessage(latest?.status==='APPROVED'?'อนุมัติแล้ว สมาชิกได้รับแต้ม':(e as Error).message)}
  finally{lock.current=false;setBusy(false)}
 }
 return <main className="shell" style={{maxWidth:560,paddingTop:24}}><h1>ตรวจสลิปเติมแต้ม</h1>{loading?<p>กำลังโหลด...</p>:!session?<AdminLogin onAuthenticated={()=>{setSession(true);load(id).catch(e=>setMessage(e.message))}}/>:row?<section className="card"><p>สมาชิก: {row.display_name}</p><p>จำนวน: {row.requested_points.toLocaleString('th-TH')} แต้ม</p><p>เลขคำขอ: {row.id}</p>{row.has_slip?<img src={'/api/admin/topup-slip?id='+encodeURIComponent(row.id)} alt="สลิปที่สมาชิกส่ง" style={{maxWidth:'100%',maxHeight:500,objectFit:'contain'}}/>:<p>ตรวจหลักฐานในแชต LINE ก่อนยืนยัน</p>}<p>สถานะ: {row.status==='APPROVED'?'อนุมัติแล้ว':row.status==='PENDING'?'รอตรวจสอบ':row.status}</p><button className={row.status==='PENDING'?'primary':'secondary'} disabled={busy||row.status!=='PENDING'} style={row.status!=='PENDING'?{background:'#9ca3af',color:'white',cursor:'not-allowed'}:undefined} onClick={approve}>{busy?'กำลังดำเนินการ':row.status==='PENDING'?'ตรวจสลิปแล้ว ยืนยัน':'อนุมัติแล้ว'}</button></section>:<p>ไม่พบคำขอ</p>}<p role="status">{message}</p></main>
}

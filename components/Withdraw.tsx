'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
type Withdrawal={id:string;requested_points:number;status:string;created_at:string};
async function read(r:Response){const body=await r.json();if(!r.ok)throw new Error(body.error||'withdrawal_request_failed');return body}
export function MemberWithdraw({onBalance}:{onBalance?:(value:number)=>void}={}){
 const[balance,setBalance]=useState<number|null>(null),[points,setPoints]=useState(''),[details,setDetails]=useState('');
 const[rows,setRows]=useState<Withdrawal[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const key=useRef<string|null>(null),pending=useRef<{points:number;details:string}|null>(null),lock=useRef(false);
 const load=useCallback(async()=>{const b=await read(await fetch('/api/member/withdrawals',{cache:'no-store'}));setBalance(b.balance);onBalance?.(b.balance);setRows(b.requests);return b},[onBalance]);
 useEffect(()=>{try{const saved=sessionStorage.getItem('pair_withdrawal_pending');if(saved){const value=JSON.parse(saved);key.current=value.key;pending.current={points:value.points,details:value.details};setPoints(String(value.points));setDetails(value.details)}}catch{}
  load().catch(e=>setMessage((e as Error).message));
  const refresh=()=>{load().catch(()=>{})};window.addEventListener('focus',refresh);return()=>window.removeEventListener('focus',refresh)
 },[load]);
 const quantity=Number(points);
 const valid=Number.isSafeInteger(quantity)&&quantity>=1&&balance!==null&&quantity<=balance&&details.trim().length>=1&&Array.from(details.trim()).length<=50&&details.length<=50;
 async function submit(){
  if(lock.current)return;lock.current=true;setBusy(true);
  try{
   if(!valid&&!key.current)throw new Error('กรุณากรอกข้อมูลรับโอนและแต้มไม่เกินยอดคงเหลือ');
   const current={points:quantity,details:details.trim()};
   if(key.current&&(pending.current?.points!==current.points||pending.current?.details!==current.details))
    throw new Error('กรุณาตรวจคำขอเดิมก่อนแก้ไขจำนวนหรือข้อมูลรับโอน');
   if(!key.current){key.current=crypto.randomUUID();pending.current=current;sessionStorage.setItem('pair_withdrawal_pending',JSON.stringify({key:key.current,...current}))}
   const b=await read(await fetch('/api/member/withdrawals',{method:'POST',credentials:'same-origin',
    headers:{'Content-Type':'application/json'},body:JSON.stringify({...pending.current,idempotencyKey:key.current}),signal:AbortSignal.timeout(20000)}));
   await load();setMessage('ส่งคำขอถอนแต้มเลขที่ '+b.request.id+' แล้ว รอแอดมินตรวจและโอน');
   key.current=null;pending.current=null;sessionStorage.removeItem('pair_withdrawal_pending');setPoints('');setDetails('');
  }catch(e){try{await load()}catch{}setMessage((e as Error).message+' · ตรวจสถานะก่อนกดส่งซ้ำ')}
  finally{lock.current=false;setBusy(false)}
 }
 return <section className="card" aria-label="ถอนแต้ม"><h2 id="wallet-dialog-title">ถอนแต้ม</h2>
  <p className="muted">เมื่อส่งคำขอ ระบบพักแต้มที่ขอไว้ก่อน หากถูกปฏิเสธจะคืนแต้มอัตโนมัติ</p><p>แต้มพร้อมถอน: <b>{balance===null?'กำลังตรวจสอบ':balance.toLocaleString('th-TH')} แต้ม</b></p>
  <label>ข้อมูลรับโอน (ไม่เกิน 50 ตัวอักษร)
   <input className="field" type="text" maxLength={50} value={details} disabled={busy} onChange={e=>setDetails(e.target.value)}/>
  </label>
  <p className="muted">ตัวอย่าง: กรอกเลขบัญชี หรือส่ง QR ให้แอดมินในแชท</p>
  <label>จำนวนแต้มที่ต้องการถอน
   <input className="field" type="number" inputMode="numeric" step="1" min="1" max={balance??undefined} value={points} disabled={busy} onChange={e=>setPoints(e.target.value)}/>
  </label>
  <button className="primary" type="button" disabled={busy||(!valid&&!key.current)} onClick={submit}>{busy?'กำลังส่ง':'ส่งคำขอถอนแต้ม'}</button>
  <p role="status">{message}</p>
  <button className="secondary" type="button" disabled={busy} onClick={()=>load().catch(e=>setMessage((e as Error).message))}>ตรวจสถานะล่าสุด</button>
  {rows.map(r=><article className="item" key={r.id}><b>{r.requested_points.toLocaleString('th-TH')} แต้ม</b><p>{r.status==='TRANSFERRED'?'โอนแล้ว':r.status==='REJECTED'?'ปฏิเสธและคืนแต้มแล้ว':'รอโอน'}</p><small>{r.id}</small></article>)}
 </section>
}

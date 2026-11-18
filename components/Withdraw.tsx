'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useLanguage} from '../lib/LanguageProvider';
import {t,formatNumber} from '../lib/i18n';
type Withdrawal={id:string;requested_points:number;status:string;debit_timing:'PREDEBIT'|'ON_APPROVAL';created_at:string};
async function read(r:Response){const body=await r.json();if(!r.ok)throw new Error(body.error||'withdrawal_request_failed');return body}
export function MemberWithdraw({onBalance}:{onBalance?:(value:number)=>void}={}){
 const {locale}=useLanguage();const m=(key:string,values:Record<string,string|number>={})=>t(key,locale,values);
 const[balance,setBalance]=useState<number|null>(null),[points,setPoints]=useState(''),[details,setDetails]=useState('');
 const[rows,setRows]=useState<Withdrawal[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const key=useRef<string|null>(null),pending=useRef<{points:number;details:string}|null>(null),lock=useRef(false);
 const load=useCallback(async()=>{const b=await read(await fetch('/api/member/withdrawals',{cache:'no-store'}));setBalance(b.balance);onBalance?.(b.balance);setRows(b.requests);return b},[onBalance]);
 useEffect(()=>{try{const saved=sessionStorage.getItem('pair_withdrawal_pending');if(saved){const value=JSON.parse(saved);key.current=value.key;pending.current={points:value.points,details:value.details};setPoints(String(value.points));setDetails(value.details)}}catch{}
  load().catch(e=>setMessage((e as Error).message));
  const refresh=()=>{load().catch(()=>{})};window.addEventListener('focus',refresh);const timer=window.setInterval(refresh,10000);return()=>{window.removeEventListener('focus',refresh);window.clearInterval(timer)}
 },[load]);
 const quantity=Number(points);
 const valid=Number.isSafeInteger(quantity)&&quantity>=1&&balance!==null&&quantity<=balance&&details.trim().length>=1&&Array.from(details.trim()).length<=50&&details.length<=50;
 async function submit(){
  if(lock.current)return;lock.current=true;setBusy(true);
  try{
   if(!valid&&!key.current)throw new Error(m('member.withdrawInvalid'));
   const current={points:quantity,details:details.trim()};
   if(key.current&&(pending.current?.points!==current.points||pending.current?.details!==current.details))
    throw new Error(m('member.withdrawPending'));
   if(!key.current){key.current=crypto.randomUUID();pending.current=current;sessionStorage.setItem('pair_withdrawal_pending',JSON.stringify({key:key.current,...current}))}
   const b=await read(await fetch('/api/member/withdrawals',{method:'POST',credentials:'same-origin',
    headers:{'Content-Type':'application/json'},body:JSON.stringify({...pending.current,idempotencyKey:key.current}),signal:AbortSignal.timeout(20000)}));
   await load();setMessage(m('member.withdrawSuccess',{id:b.request.id}));
   key.current=null;pending.current=null;sessionStorage.removeItem('pair_withdrawal_pending');setPoints('');setDetails('');
  }catch(e){try{await load()}catch{}setMessage(m('member.withdrawUncertain',{error:(e as Error).message}))}
  finally{lock.current=false;setBusy(false)}
 }
 return <section className="card member-transfer" aria-label={m('wallet.withdraw')}><h2 id="wallet-dialog-title">{m('wallet.withdraw')}</h2>
  <p className="muted">{m('member.withdrawHint')}</p><p><b>{m('member.withdrawAvailable',{points:balance===null?m('member.withdrawChecking'):m('common.points',{points:formatNumber(balance,locale)})})}</b></p>
  <label>{m('member.withdrawDetails')}
   <input className="field" type="text" maxLength={50} value={details} disabled={busy} onChange={e=>setDetails(e.target.value)}/>
  </label>
  <p className="muted">{m('member.withdrawDetailsHint')}</p>
  <label>{m('member.withdrawAmount')}
   <input className="field" type="number" inputMode="numeric" step="1" min="1" max={balance??undefined} value={points} disabled={busy} onChange={e=>setPoints(e.target.value)}/>
  </label>
  <button className="primary" type="button" disabled={busy||(!valid&&!key.current)} onClick={submit}>{busy?m('member.sending'):m('member.withdrawRequest')}</button>
  <p role="status">{message}</p>
  <button className="secondary" type="button" disabled={busy} onClick={()=>load().catch(e=>setMessage((e as Error).message))}>{m('member.checkStatus')}</button>
  {rows.map(r=><article className="item" key={r.id}><b>{m('common.points',{points:formatNumber(r.requested_points,locale)})}</b><p>{r.status==='TRANSFERRED'?m('member.withdrawTransferred'):r.status==='REJECTED'?(r.debit_timing==='PREDEBIT'?m('member.withdrawRefunded'):m('member.withdrawRejected')):m('member.withdrawWaiting')}</p><small>{r.id}</small></article>)}
 </section>
}

'use client';
import {useState} from 'react';
import type {LedgerView} from './view-types';
import styles from './styles.module.css';
export type WalletHistoryProps={entries:LedgerView[];loading?:boolean;error?:string|null;onBack?:()=>void};
const label:Record<LedgerView['type'],string>={DEMO_GRANT:'เพิ่มแต้มสาธิต',DEMO_USE:'ใช้แต้มสาธิต',DEMO_REFUND:'คืนแต้มสาธิต',DEMO_ADJUSTMENT:'ปรับยอดสาธิต'};
const day=(iso:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(iso));
const time=(iso:string)=>new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(iso));
export function WalletHistory({entries,loading=false,error=null,onBack}:WalletHistoryProps){
 const [date,setDate]=useState('');const shown=entries.filter(e=>!date||day(e.createdAt)===date);
 return <section className={styles.shell} aria-label="ประวัติแต้มสาธิต"><header className={styles.header}><div className={styles.brand}>PAIR <span>LIVE</span><small>HISTORY</small></div><h1>ประวัติแต้ม</h1><p>รายการแต้ม DEMO ของบัญชีคุณ · เวลาไทย</p></header><div className={styles.toolbar}>{onBack&&<button type="button" className={styles.back} onClick={onBack}>← กลับกระเป๋า</button>}<label>เลือกวันที่<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label></div>{error&&<p role="alert" className={styles.error}>{error}</p>}{loading&&<p role="status">กำลังโหลดรายการ…</p>}<div className={styles.historyList}>{shown.length===0&&!loading?<p className={styles.empty}>ไม่มีรายการแต้มสาธิตในวันที่เลือก</p>:shown.map(e=>{const incoming=e.type!=='DEMO_USE'&&e.points>=0;return <article className={styles.entry} key={e.id}><div className={styles.entryIcon} aria-hidden="true">{incoming?'↓':'↑'}</div><div className={styles.entryBody}><strong>{label[e.type]}</strong><time dateTime={e.createdAt}>{time(e.createdAt)}</time><small>อ้างอิง {e.referenceId}</small><small>สถานะ: {e.status==='POSTED'?'บันทึกแล้ว':'—'}</small></div><div className={incoming?styles.credit:styles.debit}>{incoming?'+':'−'}{Math.abs(e.points).toLocaleString('th-TH')}<small>แต้ม DEMO</small></div></article>})}</div><p className={styles.notice}>รายการนี้ใช้เพื่อการสาธิต ไม่มีการรับหรือถอนเงินจริง</p></section>;
}

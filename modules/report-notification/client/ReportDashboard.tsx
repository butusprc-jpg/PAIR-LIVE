'use client';
import {useState} from 'react';
import type {DailyView,RoundView,DeliveryState} from './view-types';
import styles from './styles.module.css';

export type ReportDashboardProps={date:string;daily:DailyView|null;rounds:RoundView[];loading?:boolean;error?:string|null;onDateChange?:(date:string)=>void;onExportCsv?:(date:string)=>void};
const bangkok=(iso:string)=>new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(iso));
const statusText:Record<RoundView['status'],string>={OPEN:'กำลังเปิดรับ',CLOSED:'ปิดรับแล้ว',SCANNING:'รออ่าน OCR',REVIEW_REQUIRED:'รอตรวจสอบ',SETTLED:'ยืนยันผลแล้ว',CANCELLED:'ยกเลิก'};
const deliveryText:Record<DeliveryState,string>={PENDING:'รอส่ง',PROCESSING:'กำลังส่ง',SENT:'ผู้ให้บริการรับแล้ว',RETRY:'รอส่งใหม่',FAILED:'ส่งไม่สำเร็จ',NOT_CONFIGURED:'ยังไม่ตั้งค่า',NOT_SUPPORTED:'ไม่รองรับ'};
function safeNumber(value:number){return Number.isFinite(value)?value.toLocaleString('th-TH'):'—'}
function result(round:RoundView){return round.status==='SETTLED'&&typeof round.ocrNumber==='string'&&/^\d+$/.test(round.ocrNumber)&&round.lastDigit!==null&&Number.isInteger(round.lastDigit)&&round.lastDigit>=0&&round.lastDigit<=9&&(round.parity==='EVEN'||round.parity==='ODD')?`${round.ocrNumber} · ${round.lastDigit} · ${round.parity==='EVEN'?'คู่':'คี่'}`:'ยังไม่มีผล OCR ที่ยืนยัน'}

export function ReportDashboard({date,daily,rounds,loading=false,error=null,onDateChange,onExportCsv}:ReportDashboardProps){
 const [selected,setSelected]=useState<RoundView|null>(null);
 return <section className={styles.shell} aria-label="รายงาน PAIR LIVE">
  <header className={styles.header}><div><div className={styles.brand}>PAIR <span>LIVE</span><small>REPORTS</small></div><p className={styles.eyebrow}>รายงานจากข้อมูลรอบที่บันทึกแล้ว</p><h1>ภาพรวมแต่ละรอบ</h1><p className={styles.muted}>เวลาทั้งหมดแสดงตาม Asia/Bangkok · ผล OCR แสดงเมื่อยืนยันแล้ว</p></div><div className={styles.headerIcon} aria-hidden="true">▥</div></header>
  <div className={styles.toolbar}><label>เลือกวันที่ <input type="date" value={date} onChange={e=>onDateChange?.(e.target.value)}/></label><button type="button" onClick={()=>onExportCsv?.(date)} disabled={!daily||!onExportCsv}>↓ ดาวน์โหลด CSV</button></div>
  {error&&<p className={styles.error} role="alert">{error}</p>}{loading&&<p className={styles.muted} role="status">กำลังโหลดรายงาน…</p>}
  <div className={styles.metrics}>
   <Metric label="รอบทั้งหมด" value={daily?.totalRounds}/><Metric label="ยืนยันผลแล้ว" value={daily?.settledRounds}/><Metric label="รอ OCR" value={daily?.pendingOcrRounds}/><Metric label="รอตรวจสอบ" value={daily?.reviewRequiredRounds}/>
  </div>
  <div className={styles.summary}><div><span>สมาชิกไม่ซ้ำ</span><strong>{daily?safeNumber(daily.uniqueMembers):'—'}</strong></div><div><span>รายการทั้งหมด</span><strong>{daily?safeNumber(daily.totalEntries):'—'}</strong></div><div><span>คะแนน DEMO รวม</span><strong>{daily?safeNumber(daily.totalDemoPoints):'—'}</strong></div><div><span>ผลคู่ / คี่</span><strong>{daily?`${daily.evenResults} / ${daily.oddResults}`:'—'}</strong></div><div><span>แจ้งเตือนสำเร็จ / ล้มเหลว</span><strong>{daily?`${daily.notificationsSent} / ${daily.notificationsFailed}`:'—'}</strong></div></div>
  <div className={styles.sectionTitle}><div><h2>รายการรอบ</h2><p>กดดูรายละเอียดแต่ละรอบ</p></div><span>{rounds.length} รอบ</span></div>
  <div className={styles.rounds}>{rounds.length===0&&!loading?<p className={styles.empty}>ยังไม่มีรอบในวันที่เลือก</p>:rounds.map(round=><button type="button" className={styles.roundCard} key={round.id} onClick={()=>setSelected(round)}>
   <div className={styles.roundTop}><strong>รอบ #{round.id}</strong><span className={round.status==='SETTLED'?styles.badgeDone:round.status==='REVIEW_REQUIRED'?styles.badgeWarn:styles.badge}>{statusText[round.status]}</span></div>
   <div className={styles.time}>{bangkok(round.opensAt)} <span>→</span> {bangkok(round.closesAt)} <small>{round.durationMinutes} นาที</small></div>
   <div className={styles.result}>{result(round)}</div>
   <div className={styles.sides}><div><span>คู่</span><strong>{safeNumber(round.even.points)}</strong><small>{round.even.members} คน · {round.even.entries} รายการ</small></div><div><span>คี่</span><strong>{safeNumber(round.odd.points)}</strong><small>{round.odd.members} คน · {round.odd.entries} รายการ</small></div></div>
   <div className={styles.deliveries}>{(['LINE','EMAIL','WECHAT'] as const).map(channel=><span key={channel}>{channel}: {round.deliveries?.[channel]?deliveryText[round.deliveries[channel]]:'—'}</span>)}</div>
  </button>)}</div>
  {selected&&<div className={styles.modalBackdrop} onClick={()=>setSelected(null)}><section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="round-detail-title" onClick={e=>e.stopPropagation()}><div className={styles.modalHeader}><h2 id="round-detail-title">รายละเอียดรอบ #{selected.id}</h2><button type="button" onClick={()=>setSelected(null)} aria-label="ปิด">×</button></div><dl><dt>สถานะ</dt><dd>{statusText[selected.status]}</dd><dt>เวลาเปิด / ปิด</dt><dd>{bangkok(selected.opensAt)} / {bangkok(selected.closesAt)}</dd><dt>ผล OCR</dt><dd>{result(selected)}</dd><dt>หลักฐานภาพ</dt><dd>{selected.evidenceStatus}</dd><dt>เวลายืนยันผล</dt><dd>{selected.confirmedAt?bangkok(selected.confirmedAt):'ยังไม่ยืนยัน'}</dd><dt>คู่</dt><dd>{selected.even.members} คน · {selected.even.entries} รายการ · {safeNumber(selected.even.points)} คะแนน</dd><dt>คี่</dt><dd>{selected.odd.members} คน · {selected.odd.entries} รายการ · {safeNumber(selected.odd.points)} คะแนน</dd></dl></section></div>}
 </section>
}
function Metric({label,value}:{label:string;value:number|undefined}){return <div className={styles.metric}><span>{label}</span><strong>{value===undefined?'—':safeNumber(value)}</strong></div>}

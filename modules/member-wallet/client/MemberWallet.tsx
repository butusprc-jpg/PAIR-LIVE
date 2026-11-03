'use client';
import {useState} from 'react';
import type {WalletView} from './view-types';
import styles from './styles.module.css';
export type MemberWalletProps={wallet:WalletView|null;onHistory?:()=>void;onContactAdmin?:(message:string)=>void;loading?:boolean;error?:string|null};
const fmt=(n:number)=>Number.isSafeInteger(n)&&n>=0?n.toLocaleString('th-TH'):'—';
export function MemberWallet({wallet,onHistory,onContactAdmin,loading=false,error=null}:MemberWalletProps){
 const [panel,setPanel]=useState<'grant'|'contact'|null>(null);const [question,setQuestion]=useState('');const [sent,setSent]=useState(false);
 const avatar=wallet?.avatarUrl?.startsWith('https://')?wallet.avatarUrl:null;
 return <section className={styles.shell} aria-label="กระเป๋าแต้มสาธิต"><header className={styles.header}><div className={styles.brand}>PAIR <span>LIVE</span><small>WALLET</small></div><h1>กระเป๋าแต้มสาธิต</h1><p>แต้ม DEMO ไม่มีมูลค่าเงินจริง แลกเงินหรือสิ่งของไม่ได้</p></header>
 {error&&<p className={styles.error} role="alert">{error}</p>}{loading&&<p role="status">กำลังโหลดกระเป๋า…</p>}
 {wallet?<><div className={styles.profile}><div className={styles.avatar}>{avatar?<img alt="" src={avatar} referrerPolicy="no-referrer"/>:wallet.memberName.slice(0,1)}</div><div><span>สมาชิก PAIR LIVE</span><strong>{wallet.memberName}</strong></div><span className={wallet.status==='ACTIVE'?styles.active:styles.warn}>{wallet.status==='ACTIVE'?'ใช้งานอยู่':wallet.status==='FROZEN'?'ระงับชั่วคราว':'ปิดแล้ว'}</span></div>
 <div className={styles.balance}><span>แต้มคงเหลือทั้งหมด</span><div><strong>{fmt(wallet.availablePoints+wallet.reservedPoints)}</strong><small>แต้ม DEMO</small></div><p>สำหรับกิจกรรมสาธิตในแอปเท่านั้น</p></div>
 <div className={styles.split}><div><span>แต้มพร้อมใช้</span><strong>{fmt(wallet.availablePoints)}</strong></div><div><span>แต้มที่พักไว้</span><strong>{fmt(wallet.reservedPoints)}</strong></div></div>
 <button type="button" className={styles.historyButton} onClick={onHistory} disabled={!onHistory}>ดูประวัติแต้ม <span aria-hidden="true">→</span></button>
 <div className={styles.actions}><button type="button" onClick={()=>setPanel('grant')}>เติมแต้ม <small>DEMO</small></button><button type="button" onClick={()=>{setPanel('contact');setSent(false)}}>ถอนแต้ม <small>สอบถาม</small></button></div>
 <p className={styles.notice}>ไม่มีระบบรับโอนเงิน ตรวจสลิป ถอนเงิน หรือแลกแต้ม</p>
 </>:!loading?<p className={styles.empty}>ยังไม่พบข้อมูลกระเป๋าแต้มของบัญชีนี้</p>:null}
 {panel&&<div className={styles.backdrop} onClick={()=>setPanel(null)}><section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="wallet-dialog-title" onClick={e=>e.stopPropagation()}><button type="button" className={styles.close} aria-label="ปิด" onClick={()=>setPanel(null)}>×</button>{panel==='grant'?<><h2 id="wallet-dialog-title">เติมแต้ม DEMO</h2><p>ระบบรับสลิปจริงยังไม่เปิดใช้ ปุ่มนี้เป็นเพียงตัวอย่างและไม่เพิ่มยอดแต้ม</p><p className={styles.notice}>แต้มสาธิตไม่มีมูลค่าเงินจริง</p></>:<><h2 id="wallet-dialog-title">สอบถามเรื่องแต้ม DEMO</h2><p>ช่องทางนี้ใช้ถามผู้ดูแลเกี่ยวกับแต้มสาธิตเท่านั้น ไม่มีการถอนเงินหรือแลกแต้ม</p><label className={styles.field}>ข้อความถึงผู้ดูแล<textarea maxLength={500} value={question} onChange={e=>setQuestion(e.target.value)} placeholder="อธิบายข้อสงสัยเกี่ยวกับแต้มสาธิต"/></label><button type="button" className={styles.primary} disabled={!question.trim()||!onContactAdmin} onClick={()=>{onContactAdmin?.(question.trim());setSent(true)}}>ติดต่อผู้ดูแล</button>{sent&&<p role="status">ส่งข้อความให้ช่องทางที่แอปเชื่อมต่อแล้ว</p>}{!onContactAdmin&&<p className={styles.notice}>ยังไม่เชื่อมช่องทางติดต่อผู้ดูแล</p>}</>}</section></div>}
 </section>;
}

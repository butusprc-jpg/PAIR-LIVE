'use client';
import {useState} from 'react';
import type {LedgerView} from './view-types';
import {useLanguage} from '../../../lib/LanguageProvider';
import {t,formatDate,formatNumber} from '../../../lib/i18n';
import styles from './styles.module.css';
export type WalletHistoryProps={entries:LedgerView[];loading?:boolean;error?:string|null;onBack?:()=>void};
const label:Record<LedgerView['type'],string>={DEMO_GRANT:'member.walletGrant',DEMO_USE:'member.walletUse',DEMO_REFUND:'member.walletRefund',DEMO_ADJUSTMENT:'member.walletAdjustment'};
const shortRef=(id:string)=>id.length>12?`${id.slice(0,4)}…${id.slice(-4)}`:id;
const day=(iso:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(iso));

export function WalletHistory({entries,loading=false,error=null,onBack}:WalletHistoryProps){
 const {locale}=useLanguage();const m=(key:string,values:Record<string,string|number>={})=>t(key,locale,values);const time=(iso:string)=>formatDate(iso,locale,{dateStyle:'medium',timeStyle:'short'});
 const [date,setDate]=useState('');const shown=entries.filter(e=>!date||day(e.createdAt)===date);
 return <section className={styles.shell} aria-label={m('member.walletHistoryTitle')}><header className={styles.header}><div className={styles.brand}>PAIR <span>LIVE</span><small>HISTORY</small></div><h1>{m('member.walletHistoryTitle')}</h1><p>{m('member.walletHistorySubtitle')}</p></header><div className={styles.toolbar}>{onBack&&<button type="button" className={styles.back} onClick={onBack}>{m('member.walletBack')}</button>}<label>{m('member.walletDate')}<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label></div>{error&&<p role="alert" className={styles.error}>{error}</p>}{loading&&<p role="status">{m('member.walletHistoryLoading')}</p>}<div className={styles.historyList}>{shown.length===0&&!loading?<p className={styles.empty}>{m('member.walletHistoryEmpty')}</p>:shown.map(e=>{const incoming=e.type!=='DEMO_USE'&&e.points>=0;return <article className={styles.entry} key={e.id}><div className={styles.entryIcon} aria-hidden="true">{incoming?'↓':'↑'}</div><div className={styles.entryBody}><strong>{m(label[e.type])}</strong><time dateTime={e.createdAt}>{time(e.createdAt)}</time><small title={e.referenceId}>{m('member.walletReference',{id:shortRef(e.referenceId)})}</small><small>{m('member.status')}: {e.status==='POSTED'?m('member.walletPosted'):'—'}</small></div><div className={incoming?styles.credit:styles.debit}>{incoming?'+':'−'}{formatNumber(Math.abs(e.points),locale)}<small>{m('member.pointsUnit')}</small></div></article>})}</div><p className={styles.notice}>{m('member.walletHistoryNotice')}</p></section>;
}

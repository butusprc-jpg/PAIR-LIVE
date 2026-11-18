'use client';
import type {WalletView} from './view-types';
import {useLanguage} from '../../../lib/LanguageProvider';
import {t,formatNumber} from '../../../lib/i18n';
import styles from './styles.module.css';
export type MemberWalletProps={wallet:WalletView|null;onHistory?:()=>void;onTopup?:()=>void;onWithdraw?:()=>void;loading?:boolean;error?:string|null};
export function MemberWallet({wallet,onHistory,onTopup,onWithdraw,loading=false,error=null}:MemberWalletProps){
 const {locale}=useLanguage();const m=(key:string)=>t(key,locale);const fmt=(n:number)=>Number.isSafeInteger(n)&&n>=0?formatNumber(n,locale):'—';
 const avatar=wallet?.avatarUrl?.startsWith('https://')?wallet.avatarUrl:null;
 return <section className={styles.shell} aria-label={m('wallet.balance')}><header className={styles.header}><div className={styles.brand}>PAIR <span>LIVE</span><small>WALLET</small></div><h1>{m('wallet.balance')}</h1><p>{m('member.walletDescription')}</p></header>
 {error&&<p className={styles.error} role="alert">{error}</p>}{loading&&<p role="status">{m('member.walletLoadingFull')}</p>}
 {wallet?<><div className={styles.profile}><div className={styles.avatar}>{avatar?<img alt="" src={avatar} referrerPolicy="no-referrer"/>:wallet.memberName.slice(0,1)}</div><div><span>{m('member.walletMember')}</span><strong>{wallet.memberName}</strong></div><span className={wallet.status==='ACTIVE'?styles.active:styles.warn}>{wallet.status==='ACTIVE'?m('member.walletActive'):wallet.status==='FROZEN'?m('member.walletFrozen'):m('member.walletClosed')}</span></div>
 <div className={styles.balance}><span>{m('member.walletTotal')}</span><div><strong>{fmt(wallet.availablePoints+wallet.reservedPoints)}</strong><small>{m('member.pointsUnit')}</small></div><p>{m('member.walletNotCash')}</p></div>
 <div className={styles.split}><div><span>{m('member.walletAvailable')}</span><strong>{fmt(wallet.availablePoints)}</strong></div><div><span>{m('member.walletReserved')}</span><strong>{fmt(wallet.reservedPoints)}</strong></div></div>
 <button type="button" className={styles.historyButton} onClick={onHistory} disabled={!onHistory}>{m('member.walletHistoryButton')} <span aria-hidden="true">→</span></button>
 <div className={styles.actions}><button type="button" onClick={onTopup} disabled={!onTopup}>{m('wallet.topUp')}</button><button type="button" onClick={onWithdraw} disabled={!onWithdraw}>{m('wallet.withdraw')}</button></div>
 <p className={styles.notice}>{m('member.walletNotice')}</p>
 </>:!loading?<p className={styles.empty}>{m('member.walletEmpty')}</p>:null}

 </section>;
}

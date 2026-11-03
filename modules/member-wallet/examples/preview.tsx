'use client';
import {useState} from 'react';
import {MemberWallet,WalletHistory} from '../client';
import type {WalletView,LedgerView} from '../client';
const wallet:WalletView={id:'preview-wallet',memberName:'สมาชิก PAIR LIVE',avatarUrl:null,availablePoints:1040,reservedPoints:210,status:'ACTIVE',updatedAt:'2026-11-03T08:00:00Z'};
const entries:LedgerView[]=[
 {id:'1',type:'DEMO_GRANT',points:1250,balanceBefore:0,balanceAfter:1250,referenceId:'DEMO-START',createdAt:'2026-11-03T03:15:00Z',status:'POSTED'},
 {id:'2',type:'DEMO_USE',points:120,balanceBefore:1250,balanceAfter:1130,referenceId:'DEMO-ROUND-1042',createdAt:'2026-11-03T06:05:00Z',status:'POSTED'},
 {id:'3',type:'DEMO_REFUND',points:30,balanceBefore:1130,balanceAfter:1160,referenceId:'DEMO-REFUND-1042',createdAt:'2026-11-03T07:10:00Z',status:'POSTED'},
];
/** Display-only fixture; no member authentication, API, credits or monetary transfer. */
export function WalletPreview(){const [history,setHistory]=useState(false);return history?<WalletHistory entries={entries} onBack={()=>setHistory(false)}/>:<MemberWallet wallet={wallet} onHistory={()=>setHistory(true)}/>}
export function WalletHistoryPreview(){return <WalletHistory entries={entries} onBack={()=>{}}/>}

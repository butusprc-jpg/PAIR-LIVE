'use client';
import {useEffect,useRef,useState} from 'react';
import {adaptivePoll} from '../../../lib/client/adaptive-poll';
import {validatedViewerUrl} from './VdoViewer';
import {visibleResultAnnouncement,type ResultAnnouncement} from '../../../lib/rounds/result-announcement';
import {serverClockOffset} from '../../../lib/rounds/countdown';
import {recordClientTiming} from '../../../lib/client/performance-timing';
import {useLanguage} from '../../../lib/LanguageProvider';
import {t} from '../../../lib/i18n';
type Camera={cameraId:string;name:string;viewerUrl:string|null};
type State={site:{name:string}|null;cameras:Camera[];layout:'empty'|'single'|'double'|'featured'|'quad'};
export default function MemberLivePlayer({roundStatus}:{roundStatus?:string|null}){
 const {locale}=useLanguage();const m=(key:string,values:Record<string,string|number>={})=>t(key,locale,values);
 const[state,setState]=useState<State|null>(null),[error,setError]=useState(false),[announcement,setAnnouncement]=useState<ResultAnnouncement|null>(null),[offset,setOffset]=useState(0),[now,setNow]=useState(0);
 const painted=useRef<string|null>(null);
 useEffect(()=>adaptivePoll(async()=>{try{const start=performance.now(),response=await fetch('/api/live/cameras',{credentials:'same-origin',cache:'no-store'});if(!response.ok)throw Error('live_unavailable');const next=await response.json() as State;recordClientTiming('member.cameras',start);setState(next);setError(false);return next.cameras.length>0}catch{setError(true);return false}},{onEvent:'pair-live:member-change',live:true}),[]);
 useEffect(()=>{const clock=window.setInterval(()=>setNow(Date.now()),200);return()=>window.clearInterval(clock)},[]);
 useEffect(()=>adaptivePoll(async()=>{try{const sent=Date.now(),response=await fetch('/api/round/result-announcement',{credentials:'same-origin',cache:'no-store'});if(!response.ok)throw Error('result_unavailable');const data=await response.json();setOffset(serverClockOffset(data.serverTime,sent,Date.now()));setAnnouncement(data.announcement);return true}catch{setAnnouncement(null);return false}},{onEvent:'pair-live:member-change',live:true,roundVisible:roundStatus==='SCANNING'}),[roundStatus]);
 const digit=visibleResultAnnouncement(announcement,(now||Date.now())+offset)?.lastDigit??null;
 useEffect(()=>{if(!digit||!announcement||painted.current===announcement.roundId)return;const frame=requestAnimationFrame(()=>{const elapsed=Date.now()+offset-Date.parse(announcement.confirmedAt);if(elapsed>=0&&elapsed<10_000&&painted.current!==announcement.roundId){painted.current=announcement.roundId;const end=performance.now();performance.measure('pair.member.announcement.delay',{start:Math.max(0,end-elapsed),end})}});return()=>cancelAnimationFrame(frame)},[digit,announcement,offset]);
 if(!state||state.cameras.length===0)return <div className="external-live-frame" aria-label={m('camera.live')} aria-busy={!state&&!error}/>;
 return <div className={`camera-grid camera-grid-${state.layout}`} aria-label={m('member.cameraSite',{name:state.site?.name||'PAIR LIVE'})}>{state.cameras.map(camera=>{const href=validatedViewerUrl(camera.viewerUrl||'');return <section className="camera-tile" key={camera.cameraId}><div className="external-live-frame member-direct-live">{href?<a className="primary" href={href} aria-label={`เปิดภาพสด ${camera.name} ในหน้า LINE เดิม`}>เปิดภาพสดใน LINE</a>:<span role="status">ลิงก์ภาพสดไม่ถูกต้อง</span>}{digit&&<div className="live-result-overlay" role="status" aria-label={m('round.lastDigit',{digit})}>{digit}</div>}</div></section>})}</div>;
}

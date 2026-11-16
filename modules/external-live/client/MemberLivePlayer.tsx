'use client';
import {useEffect,useState} from 'react';
import {adaptivePoll} from '../../../lib/client/adaptive-poll';
import VdoViewer from './VdoViewer';
import {visibleResultAnnouncement,type ResultAnnouncement} from '../../../lib/rounds/result-announcement';
import {serverClockOffset} from '../../../lib/rounds/countdown';
import {recordClientTiming} from '../../../lib/client/performance-timing';
type Camera={cameraId:string;name:string;viewerUrl:string|null};
type State={site:{name:string}|null;cameras:Camera[];layout:'empty'|'single'|'double'|'featured'|'quad'};
export default function MemberLivePlayer(){
 const[state,setState]=useState<State|null>(null),[error,setError]=useState(false),[announcement,setAnnouncement]=useState<ResultAnnouncement|null>(null),[offset,setOffset]=useState(0),[now,setNow]=useState(0);
 useEffect(()=>adaptivePoll(async()=>{try{const start=performance.now(),response=await fetch('/api/live/cameras',{credentials:'same-origin',cache:'no-store'});if(!response.ok)throw Error('live_unavailable');const next=await response.json() as State;recordClientTiming('member.cameras',start);setState(next);setError(false);return next.cameras.length>0}catch{setError(true);return false}},{onEvent:'pair-live:member-change',live:true}),[]);
 useEffect(()=>{const clock=window.setInterval(()=>setNow(Date.now()),200);return()=>window.clearInterval(clock)},[]);
 useEffect(()=>adaptivePoll(async()=>{try{const sent=Date.now(),response=await fetch('/api/round/result-announcement',{credentials:'same-origin',cache:'no-store'});if(!response.ok)throw Error('result_unavailable');const data=await response.json();setOffset(serverClockOffset(data.serverTime,sent,Date.now()));setAnnouncement(data.announcement);return true}catch{setAnnouncement(null);return false}},{onEvent:'pair-live:member-change',live:true}),[]);
 const digit=visibleResultAnnouncement(announcement,(now||Date.now())+offset)?.lastDigit??null;
 if(!state||state.cameras.length===0)return <div className="external-live-frame" aria-label="จอถ่ายทอดสด" aria-busy={!state&&!error}/>;
 return <div className={`camera-grid camera-grid-${state.layout}`} aria-label={`กล้อง ${state.site?.name||'PAIR LIVE'}`}>{state.cameras.map(camera=><section className="camera-tile" key={camera.cameraId}>{camera.viewerUrl?<VdoViewer url={camera.viewerUrl} label={camera.name} minimal overlayDigit={digit}/>:<div className="external-live-frame"/>}</section>)}</div>;
}

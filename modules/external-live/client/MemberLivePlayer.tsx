'use client';
import {useEffect,useState} from 'react';
import {adaptivePoll} from '../../../lib/client/adaptive-poll';
import VdoViewer from './VdoViewer';
type Camera={cameraId:string;name:string;viewerUrl:string|null};
type State={site:{name:string}|null;cameras:Camera[];layout:'empty'|'single'|'double'|'featured'|'quad'};
export default function MemberLivePlayer(){
 const[state,setState]=useState<State|null>(null),[error,setError]=useState(false);
 useEffect(()=>adaptivePoll(async()=>{try{const response=await fetch('/api/live/cameras',{credentials:'same-origin',cache:'no-store'});if(!response.ok)throw Error('live_unavailable');const next=await response.json() as State;setState(next);setError(false);return next.cameras.length>0}catch{setError(true);return false}},{onEvent:'pair-live:member-change',live:true}),[]);
 if(!state||state.cameras.length===0)return <div className="external-live-frame" aria-label="จอถ่ายทอดสด"><div className="external-live-empty" role="status">{error?'ไม่สามารถโหลดสถานะ LIVE ได้':state?'ยังไม่มีการถ่ายทอดสด':'กำลังโหลด LIVE...'}</div></div>;
 return <div className={`camera-grid camera-grid-${state.layout}`} aria-label={`กล้อง ${state.site?.name||'PAIR LIVE'}`}>{state.cameras.map(camera=><section className="camera-tile" key={camera.cameraId}><h3>{camera.name}</h3>{camera.viewerUrl?<VdoViewer url={camera.viewerUrl} label={camera.name}/>:<div className="external-live-frame"><div className="external-live-empty">Not Configured</div></div>}</section>)}</div>;
}

'use client';
import {useEffect,useState} from 'react';
import {adaptivePoll} from '../../../lib/client/adaptive-poll';
import VdoViewer from './VdoViewer';
type State={displayEnabled:boolean;viewerUrl:string|null};
export default function MemberLivePlayer(){const [state,setState]=useState<State|null>(null),[error,setError]=useState(false);useEffect(()=>adaptivePoll(async()=>{try{const response=await fetch('/api/live',{credentials:'same-origin',cache:'no-store'});if(!response.ok)throw Error('live_unavailable');const next=await response.json() as State;setState(next);setError(false);return next.displayEnabled}catch{setState(null);setError(true);return false}},{onEvent:'pair-live:member-change'}),[]);return state?.displayEnabled&&state.viewerUrl?<VdoViewer url={state.viewerUrl} label="PAIR LIVE VDO.Ninja"/>:<div className="external-live-frame" aria-label="จอถ่ายทอดสด"><div className="external-live-empty" role="status">{error?'ไม่สามารถโหลดสถานะ LIVE ได้':state?'ยังไม่มี LIVE':'กำลังโหลด LIVE...'}</div></div>}

'use client';
import {useLiveState} from './useLiveState';
export default function MemberLivePlayer(){const {state,error,seconds}=useLiveState('/api/live');const showing=state?.status==='SHOWING'&&seconds>0&&state.embedUrl;
 return <div className="external-live-frame" aria-label="จอถ่ายทอดสด">{showing?<iframe key={state.embedUrl!} src={state.embedUrl!} title="PAIR LIVE" allow="fullscreen; picture-in-picture" allowFullScreen referrerPolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-presentation"/>:<div className="external-live-empty" role="status">{error?'ไม่สามารถโหลดสถานะ LIVE ได้':state?.status==='INTERMISSION'?`พัก ${seconds} วินาที`:state?'ยังไม่มี LIVE':'กำลังโหลด LIVE...'}</div>}</div>}

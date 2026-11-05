'use client';
import {useEffect,useRef,useState} from 'react';
import {Camera,Expand} from 'lucide-react';
export default function MemberStream({roundLabel,clock}:{roundLabel:string;clock:string}){
 const wrapper=useRef<HTMLDivElement>(null),video=useRef<HTMLVideoElement>(null),room=useRef<import('livekit-client').Room|null>(null);
 const[status,setStatus]=useState<'CONNECTING'|'LIVE'|'OFFLINE'|'NOT_CONFIGURED'>('CONNECTING');
 useEffect(()=>{
  let alive=true,busy=false;
  function clearVideo(){if(video.current)video.current.srcObject=null}
  async function connect(){if(busy||room.current||!navigator.onLine)return;busy=true;setStatus('CONNECTING');let client:import('livekit-client').Room|null=null;
   try{
    const response=await fetch('/api/stream/viewer',{method:'POST',credentials:'same-origin'});if(!response.ok)throw new Error('viewer_token_unavailable');
    const data=await response.json();if(!alive)return;
    const {Room,RoomEvent,Track}=await import('livekit-client');if(!alive)return;
    client=new Room({adaptiveStream:true,dynacast:true});const current=client;
    current.on(RoomEvent.TrackSubscribed,track=>{if(alive&&room.current===current&&track.kind===Track.Kind.Video&&video.current&&!track.isMuted&&navigator.onLine){track.attach(video.current);setStatus('LIVE')}});
    current.on(RoomEvent.TrackUnsubscribed,track=>{if(track.kind===Track.Kind.Video){track.detach();clearVideo();if(alive&&room.current===current)setStatus('OFFLINE')}});
    current.on(RoomEvent.TrackMuted,track=>{if(track.kind===Track.Kind.Video&&alive&&room.current===current){clearVideo();setStatus('CONNECTING')}});
    current.on(RoomEvent.TrackUnmuted,track=>{if(track.kind===Track.Kind.Video&&alive&&room.current===current&&video.current&&navigator.onLine){track.track?.attach(video.current);if(track.track)setStatus('LIVE')}});
    current.on(RoomEvent.Reconnecting,()=>{if(alive&&room.current===current){clearVideo();setStatus('CONNECTING')}});
    current.on(RoomEvent.Disconnected,()=>{if(room.current===current){room.current=null;clearVideo();if(alive)setStatus('CONNECTING')}});
    room.current=current;await current.connect(data.url,data.token,{autoSubscribe:true});if(!alive)await current.disconnect();
   }catch{if(client){if(room.current===client)room.current=null;await client.disconnect().catch(()=>{})}clearVideo();if(alive)setStatus('CONNECTING')}
   finally{busy=false}
  }
  async function refresh(){if(!navigator.onLine){clearVideo();if(alive)setStatus('CONNECTING');return}try{const response=await fetch('/api/stream/status',{cache:'no-store'});if(!response.ok)throw new Error('status_unavailable');const data=await response.json();if(!alive)return;if(data.status==='LIVE'){if(!room.current)void connect()}else{const old=room.current;room.current=null;clearVideo();if(old)void old.disconnect();setStatus(data.status==='NOT_CONFIGURED'?'NOT_CONFIGURED':'OFFLINE')}}catch{if(alive){clearVideo();setStatus('CONNECTING')}}}
  void refresh();const timer=setInterval(refresh,5000);const online=()=>void refresh(),offline=()=>{clearVideo();setStatus('CONNECTING')},visible=()=>{if(document.visibilityState==='visible')void refresh()};window.addEventListener('online',online);window.addEventListener('offline',offline);document.addEventListener('visibilitychange',visible);return()=>{alive=false;clearInterval(timer);window.removeEventListener('online',online);window.removeEventListener('offline',offline);document.removeEventListener('visibilitychange',visible);const old=room.current;room.current=null;void old?.disconnect();clearVideo()}
 },[]);
 return <><div className="video" ref={wrapper}><video ref={video} className="viewer-video" autoPlay playsInline muted/><div className="video-top"><span className={'tag '+(status==='LIVE'?'red':'')}>{status==='LIVE'?'● LIVE':status}</span></div>{status!=='LIVE'&&<div className="video-center"><Camera size={45}/><strong>{status==='CONNECTING'?'กำลังเชื่อมต่อ':status==='NOT_CONFIGURED'?'ยังไม่ตั้งค่าสตรีม':'กล้องหยุดถ่ายทอด'}</strong><small>{status==='CONNECTING'?'กำลังลองเชื่อมต่อใหม่':'ไม่มีสัญญาณภาพสด'}</small></div>}<div className="video-bottom"><span className="tag">{status==='LIVE'?'สัญญาณภาพสด · ไม่มีเสียง':'รอสัญญาณ'}</span><button aria-label="ขยายเต็มจอ" onClick={()=>wrapper.current?.requestFullscreen?.()}><Expand size={17}/></button></div></div><div className="stream-clock">{roundLabel} · {clock}</div></>
}

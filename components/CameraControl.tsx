'use client';
import {useEffect,useRef,useState} from 'react';
import {Camera,Radio,RefreshCw,StopCircle} from 'lucide-react';
import {cameraError,requestCamera,stopCamera} from '../lib/stream/camera';
import type {Facing} from '../lib/stream/camera';
import {CameraOperation} from '../lib/stream/camera-operation';
import {mockStreamBus} from '../lib/stream/mock';
import type {Room} from 'livekit-client';
type Status='OFFLINE'|'PREVIEW'|'CONNECTING'|'LIVE'|'ERROR'|'DEMO_ACTIVE';
export default function CameraControl({mode='demo'}:{mode?:'demo'|'live'}){
 const video=useRef<HTMLVideoElement>(null),stream=useRef<MediaStream|null>(null),room=useRef<Room|null>(null),mounted=useRef(false);
 const operation=useRef(new CameraOperation()),published=useRef(false),statusRef=useRef<Status>('OFFLINE');
 const[facing,setFacing]=useState<Facing>('environment'),[status,setStatus]=useState<Status>('OFFLINE'),[error,setError]=useState('');
 function show(value:Status){statusRef.current=value;if(mounted.current)setStatus(value)}
 async function clear(){mockStreamBus.stop();published.current=false;const old=room.current,oldStream=stream.current;room.current=null;stream.current=null;if(video.current?.srcObject===oldStream)video.current.srcObject=null;stopCamera(oldStream);if(old)await old.disconnect().catch(()=>{})}
 async function stop(){operation.current.cancel();show('OFFLINE');setError('');await clear()}
 useEffect(()=>{mounted.current=true;const offline=()=>{if(mode==='demo'){mockStreamBus.stop();if(statusRef.current==='DEMO_ACTIVE')show('PREVIEW')}else if(statusRef.current==='LIVE'){show('CONNECTING');setError('อินเทอร์เน็ตหลุด กรุณารอการเชื่อมต่อใหม่')}};const online=()=>{if(statusRef.current==='CONNECTING')setError('')};window.addEventListener('offline',offline);window.addEventListener('online',online);return()=>{mounted.current=false;operation.current.cancel();window.removeEventListener('offline',offline);window.removeEventListener('online',online);void clear()}},[mode]);
 async function publish(ticket:number){
  if(!stream.current?.active)throw new Error('กรุณาเปิดกล้องก่อน');
  if(!navigator.onLine)throw new Error('อินเทอร์เน็ตหลุด');
  show('CONNECTING');
  const challenge=await fetch('/api/admin/auth/challenge',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({purpose:'mutation'}),credentials:'same-origin'}).then(r=>r.json());
  if(!operation.current.current(ticket))return;
  if(!challenge.ok||!challenge.csrfToken)throw new Error('ไม่สามารถขอสิทธิ์แอดมินได้');
  const response=await fetch('/api/stream/publisher',{method:'POST',credentials:'same-origin',headers:{'X-Admin-CSRF':challenge.csrfToken}});
  if(!operation.current.current(ticket))return;
  const grant=await response.json();if(!response.ok)throw new Error(grant.error||'ไม่สามารถเริ่ม LIVE ได้');
  const {Room,RoomEvent}=await import('livekit-client');if(!operation.current.current(ticket))return;
  const live=new Room({adaptiveStream:true,dynacast:true});room.current=live;published.current=false;
  live.on(RoomEvent.Reconnecting,()=>{if(room.current===live&&operation.current.current(ticket))show('CONNECTING')});
  live.on(RoomEvent.Reconnected,()=>{if(room.current===live&&operation.current.current(ticket)&&published.current&&stream.current?.active&&navigator.onLine)show('LIVE')});
  live.on(RoomEvent.Disconnected,()=>{if(room.current===live&&operation.current.current(ticket)){room.current=null;published.current=false;show('ERROR');setError('LIVE หลุด กรุณาเริ่มถ่ายทอดอีกครั้ง')}});
  await live.connect(grant.url,grant.token);
  if(!operation.current.current(ticket)||room.current!==live){await live.disconnect().catch(()=>{});return}
  const track=stream.current?.getVideoTracks()[0];if(!track||track.readyState!=='live')throw new Error('กล้องหยุดทำงาน');
  await live.localParticipant.publishTrack(track,{name:'scale-camera',simulcast:false});
  if(!operation.current.current(ticket)||room.current!==live||!track.enabled||track.readyState!=='live'||!navigator.onLine){await live.disconnect().catch(()=>{});return}
  published.current=true;show('LIVE');setError('');
 }
 async function open(next:Facing=facing,resumeLive=false){
  const ticket=operation.current.begin();if(ticket===null)return;
  setError('');show('CONNECTING');
  try{
   if(!navigator.mediaDevices?.getUserMedia)throw new Error('เบราว์เซอร์นี้ใช้กล้องไม่ได้ หรือไม่ได้เปิดผ่าน HTTPS');
   await clear();if(!operation.current.current(ticket))return;
   const media=await requestCamera(navigator.mediaDevices,next);
   if(!operation.current.current(ticket)||!mounted.current){stopCamera(media);return}
   stream.current=media;if(video.current)video.current.srcObject=media;
   const track=media.getVideoTracks()[0];
   track?.addEventListener('ended',()=>{if(stream.current===media){operation.current.cancel();void clear();show('ERROR');setError('กล้องหยุดทำงาน กรุณาเปิดใหม่')}},{once:true});
   setFacing(next);show('PREVIEW');
   if(resumeLive&&mode==='live')await publish(ticket);
  }catch(caught){if(operation.current.current(ticket)){await clear();show('ERROR');setError(caught instanceof Error&&!(caught instanceof DOMException)?caught.message:cameraError(caught))}}
  finally{operation.current.finish(ticket)}
 }
 async function startLive(){const ticket=operation.current.begin();if(ticket===null)return;try{setError('');await publish(ticket)}catch(caught){if(operation.current.current(ticket)){const old=room.current;room.current=null;published.current=false;await old?.disconnect().catch(()=>{});show('ERROR');setError(caught instanceof Error?caught.message:'เชื่อมต่อ LIVE ไม่สำเร็จ')}}finally{operation.current.finish(ticket)}}
 function startDemo(){if(operation.current.busy)return;if(!stream.current?.active){show('ERROR');setError('กรุณาเปิดกล้องก่อน');return}if(!navigator.onLine){show('ERROR');setError('อินเทอร์เน็ตหลุด');return}mockStreamBus.publish(stream.current);show('DEMO_ACTIVE');setError('')}
 const hasCamera=!!stream.current?.active;
 return <section className="card camera-control" aria-label={mode==='live'?'ควบคุมกล้อง LIVE':'ควบคุมกล้อง DEMO'}><div className="row"><h2><Camera size={18}/> ควบคุมกล้อง</h2><span className={'badge '+(status==='LIVE'||status==='DEMO_ACTIVE'?'green':'orange')}>{status==='DEMO_ACTIVE'?'DEMO ACTIVE':status}</span></div><div className="camera-preview"><video ref={video} autoPlay playsInline muted/><div className="camera-preview-label">{status==='OFFLINE'?'กล้องปิดอยู่':`${facing==='environment'?'กล้องหลัง':'กล้องหน้า'} · 720p / 15 FPS (ถ้ารองรับ)`}</div></div><div className="camera-controls"><button className="secondary" onClick={()=>void open()} disabled={status==='CONNECTING'}><Camera size={16}/> เปิดกล้อง</button><button className="secondary" onClick={()=>void open(facing==='environment'?'user':'environment',status==='LIVE')} disabled={!hasCamera||status==='CONNECTING'}><RefreshCw size={16}/> สลับกล้อง</button><button className="secondary" onClick={mode==='live'?()=>void startLive():startDemo} disabled={!hasCamera||status==='CONNECTING'||status==='LIVE'||status==='DEMO_ACTIVE'}><Radio size={16}/> {mode==='live'?'เริ่มถ่ายทอด LIVE':'เริ่มถ่ายทอด DEMO'}</button><button className="secondary" onClick={()=>void stop()} disabled={status==='OFFLINE'}><StopCircle size={16}/> หยุดและปิดกล้อง</button></div>{error&&<p role="alert" className="urgent-note">{error}</p>}<p className="muted footnote">{mode==='live'?'LIVE ต้องมีสิทธิ์แอดมิน รอบที่เผยแพร่ได้ และ LiveKit ที่ตั้งค่าแล้ว':'ภาพ DEMO อยู่ในแท็บนี้เท่านั้น'}</p></section>
}

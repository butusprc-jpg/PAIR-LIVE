'use client';
import * as React from 'react';
import {useEffect,useRef,useState} from 'react';
import {initLIFF} from '../../../lib/liff';
import {isLineWebView} from '../../../lib/topup/qr-navigation';
import {useLanguage} from '../../../lib/LanguageProvider';
import {t} from '../../../lib/i18n';

export function validatedViewerUrl(raw:string){let url:URL;try{url=new URL(raw)}catch{return null}const id=url.searchParams.get('view');return url.origin==='https://vdo.ninja'&&url.pathname==='/'&&url.searchParams.size===1&&!!id&&/^[A-Za-z0-9_-]{7,64}$/.test(id)&&!url.hash?url.toString():null}
type VideoStatus='CHECKING'|'CONFIRMED'|'UNVERIFIED';
/** The cross-origin iframe can play video without returning VDO.Ninja stats. Do not display "checking" forever. */
export default function VdoViewer({url,label,minimal=false,overlayDigit}:{url:string;label:string;minimal?:boolean;overlayDigit?:string|null}){
 const {locale}=useLanguage();const m=(key:string,values:Record<string,string|number>={})=>t(key,locale,values);
 const safeUrl=validatedViewerUrl(url),embedUrl=safeUrl?`${safeUrl}&noaudio`:null,frame=useRef<HTMLIFrameElement>(null),[status,setStatus]=useState<VideoStatus>('CHECKING'),[frameLoaded,setFrameLoaded]=useState(false),[openError,setOpenError]=useState('');
 useEffect(()=>{
  setStatus('CHECKING');setFrameLoaded(false);if(!safeUrl)return;
  let lastFrames=0,lastFrameAt=0;const startAt=Date.now();const token=Math.random().toString(36).slice(2);
  const onMessage=(event:MessageEvent)=>{
   if(event.origin!=='https://vdo.ninja'||event.source!==frame.current?.contentWindow)return;
   const data=event.data;
   if(!data||data.cib!==token||!data.stats?.inbound)return;
   const id=new URL(safeUrl).searchParams.get('view')||'';
   const inbound=data.stats.inbound;
   // VDO.Ninja can return a stream-id keyed object or a flat stats snapshot.
   const stream=Object.prototype.hasOwnProperty.call(inbound,id)?inbound[id]:inbound;
   let frames=0;
   const visit=(value:unknown,depth:number)=>{
    if(depth>5||!value||typeof value!=='object')return;
    for(const [key,item] of Object.entries(value)){
     if((key==='framesDecoded'||key==='framesReceived')&&typeof item==='number'&&Number.isFinite(item))frames+=item;
     else if(typeof item==='object')visit(item,depth+1);
    }
   };
   visit(stream,0);
   if(frames>lastFrames){lastFrameAt=Date.now();setStatus('CONFIRMED')}
   lastFrames=frames;
  };
  window.addEventListener('message',onMessage);
  const timer=window.setInterval(()=>{
   frame.current?.contentWindow?.postMessage({getStats:true,cib:token},'https://vdo.ninja');
   // No stats means unverified, NOT that the stream is offline; the iframe may be playing.
   if(lastFrameAt>0&&Date.now()-lastFrameAt<=12000)setStatus('CONFIRMED');
   else if(Date.now()-startAt>=12000)setStatus('UNVERIFIED');
  },3000);
  return()=>{window.removeEventListener('message',onMessage);window.clearInterval(timer)};
 },[safeUrl]);
 async function openExternal(){
  if(!safeUrl)return;
  try{if(isLineWebView(navigator.userAgent)){const auth=await initLIFF();if(!auth)return;auth.client.openWindow({url:safeUrl,external:true})}
   else window.open(safeUrl,'_blank','noopener,noreferrer')}
  catch{setOpenError(m('admin.viewer.externalError'))}
 }
 if(!safeUrl)return <div className="external-live-frame">{!minimal&&<div className="external-live-empty" role="status">{m('admin.viewer.invalidUrl')}</div>}</div>;
 return <><div className="external-live-frame"><iframe ref={frame} src={embedUrl!} title={label}
  onLoad={()=>setFrameLoaded(true)} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen
  referrerPolicy="no-referrer"/>
  {overlayDigit&&<div className="live-result-overlay" role="status" aria-label={m('round.lastDigit',{digit:overlayDigit})}>{overlayDigit}</div>}
  {!minimal&&!frameLoaded&&status==='CHECKING'&&<div className="external-live-empty vdo-waiting" role="status">{m('admin.viewer.opening')}</div>}
 </div>{!minimal&&<><p className="muted" role="status">
  {m(status==='CONFIRMED'?'admin.viewer.confirmed':status==='CHECKING'?'admin.viewer.checking':'admin.viewer.unverified')}
  {' · '}<button type="button" className="secondary" onClick={()=>void openExternal()}>{m('admin.viewer.external')}</button>
 </p>{openError&&<p role="status">{openError}</p>}</>}</>;
}

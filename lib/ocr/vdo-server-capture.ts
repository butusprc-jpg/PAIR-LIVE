import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import type {Browser,Page} from 'playwright-core';
import type {Frame,Roi} from './core';
import type {TrustedFrameSource} from './trusted-frame-source';

/** A server-owned WebRTC viewer. No image or stream URL is accepted from a client. */
export class VdoNinjaServerCapture implements TrustedFrameSource{
 readonly type='MOBILE_CAMERA' as const;
 readonly transport='SERVER_ATTESTED_CAPTURE' as const;
 private browser:Browser|null=null;
 private page:Page|null=null;
 private lastFrame=0;
 private streamId:string|null=null;
 private openedRoundId:string|null=null;
 private closedAt:string|null=null;
 constructor(private pool:Pool,private executablePath=process.env.OCR_CHROMIUM_PATH||'/usr/bin/chromium'){}
 async open(roundId:string){
  if(!/^\d+$/.test(roundId))throw new Error('invalid_round_id');
  const state=(await this.pool.query<{stream_id:string;status:string;closed_at:Date|null;settlement_oa_id:string;display_enabled:boolean}>(`SELECT t.stream_id,r.status,r.closed_at,r.settlement_oa_id,t.display_enabled
   FROM rounds r JOIN vdo_ninja_tenants t ON t.oa_id=r.settlement_oa_id
   WHERE r.id=$1 AND r.epoch_id=current_round_epoch_id()`,[roundId])).rows[0];
  if(!state||!['SCANNING','REVIEW_REQUIRED'].includes(state.status)||!state.closed_at||!state.display_enabled||!/^[A-Za-z0-9_-]{7,64}$/.test(state.stream_id))throw new Error('trusted_live_source_unavailable');
  const {chromium}=await import('playwright-core');
  this.browser=await chromium.launch({headless:true,executablePath:this.executablePath,args:['--no-sandbox','--disable-dev-shm-usage','--autoplay-policy=no-user-gesture-required']});
  this.page=await this.browser.newPage({serviceWorkers:'block',acceptDownloads:false,viewport:{width:1280,height:720}});
  this.streamId=state.stream_id;
  this.openedRoundId=roundId;
  this.closedAt=new Date(state.closed_at).toISOString();
  await this.page.goto(`https://vdo.ninja/?view=${encodeURIComponent(state.stream_id)}`,{waitUntil:'domcontentloaded',timeout:20000});
 }
 async capture(roundId:string):Promise<Frame>{if(roundId!==this.openedRoundId||!this.closedAt)throw new Error('wrong_round_frame');return this.captureAfter(roundId,this.closedAt,{x:0,y:0,width:1,height:1})}
 async captureAfter(roundId:string,closedAt:string,_roi:Roi):Promise<Frame>{
  if(!this.page||!this.streamId)throw new Error('trusted_live_source_unavailable');
  const state=(await this.pool.query<{stream_id:string;status:string;closed_at:Date|null;display_enabled:boolean}>(`SELECT t.stream_id,r.status,r.closed_at,t.display_enabled FROM rounds r JOIN vdo_ninja_tenants t ON t.oa_id=r.settlement_oa_id
   WHERE r.id=$1 AND r.epoch_id=current_round_epoch_id()`,[roundId])).rows[0];
  const closedAtMs=Date.parse(closedAt);
  if(!state||!['SCANNING','REVIEW_REQUIRED'].includes(state.status)||!state.closed_at||!state.display_enabled||state.stream_id!==this.streamId||!Number.isFinite(closedAtMs)||closedAtMs!==new Date(state.closed_at).getTime()||closedAtMs>Date.now())throw new Error('trusted_live_source_unavailable');
  const video=this.page.locator('video').filter({visible:true}).first();
  await video.waitFor({state:'visible',timeout:10000});
  const frameNumber=await video.evaluate(async(node,last)=>{
   const element=node as HTMLVideoElement;
   if(element.readyState<2||element.videoWidth<1||element.videoHeight<1||element.paused||element.ended)throw new Error('camera_offline');
   return await new Promise<number>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('camera_stale')),8000);
    const next=(_time:number,metadata:VideoFrameCallbackMetadata)=>{if(metadata.presentedFrames>last){clearTimeout(timer);resolve(metadata.presentedFrames)}else element.requestVideoFrameCallback(next)};
    element.requestVideoFrameCallback(next);
   });
  },this.lastFrame);
  this.lastFrame=frameNumber;
  const image=Buffer.from(await video.screenshot({type:'png',timeout:10000}));
  if(image.length<24||!image.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new Error('invalid_camera_frame');
  const capturedAt=new Date().toISOString();
  if(Date.parse(capturedAt)<Date.parse(closedAt))throw new Error('frame_before_round_close');
  return {id:randomUUID(),roundId,source:'MOBILE_CAMERA',capturedAt,image,width:image.readUInt32BE(16),height:image.readUInt32BE(20),healthy:true};
 }
 async health(){return this.page&&this.lastFrame>0?'HEALTHY' as const:'OFFLINE' as const}
 async close(){await this.browser?.close();this.browser=null;this.page=null;this.streamId=null;this.openedRoundId=null;this.closedAt=null;this.lastFrame=0}
}

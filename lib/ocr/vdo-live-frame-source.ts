import {randomUUID} from 'node:crypto';
import type {Browser,Page} from 'playwright-core';
import type {Frame} from './core';
import type {LiveCamera,LiveFrameSource} from './live-frame-source';
import {captureDecodedVideo} from './playwright-video-frame';

/** Read-only viewer for the admin-selected camera. No client image enters this adapter. */
export class VdoLiveFrameSource implements LiveFrameSource{
 readonly kind='VDO_NINJA' as const;
 private browser:Browser|null=null;
 private page:Page|null=null;
 private camera:LiveCamera|null=null;
 private lastPresentedFrame=0;
 constructor(private executablePath=process.env.OCR_CHROMIUM_PATH||'/usr/bin/chromium'){}
 async open(camera:LiveCamera){
  if(camera.sourceKind!=='VDO_NINJA'||!camera.displayEnabled||!camera.streamId||!/^[A-Za-z0-9_-]{7,64}$/.test(camera.streamId))throw new Error('live_camera_unavailable');
  const {chromium}=await import('playwright-core');
  try{
   this.browser=await chromium.launch({headless:true,executablePath:this.executablePath,args:['--no-sandbox','--disable-dev-shm-usage','--autoplay-policy=no-user-gesture-required']});
   this.page=await this.browser.newPage({serviceWorkers:'block',acceptDownloads:false,viewport:{width:1280,height:720}});
   await this.page.goto(`https://vdo.ninja/?view=${encodeURIComponent(camera.streamId)}`,{waitUntil:'domcontentloaded',timeout:20000});
   this.camera=camera;
  }catch(error){await this.close();throw error}
 }
 async capture():Promise<Frame>{
  if(!this.page||!this.camera)throw new Error('live_camera_unavailable');
  const frame=await captureDecodedVideo(this.page,this.lastPresentedFrame);
  this.lastPresentedFrame=frame.presentedFrame;
  return {id:randomUUID(),roundId:'0',source:'MOBILE_CAMERA',capturedAt:frame.capturedAt,image:frame.image,width:frame.width,height:frame.height,healthy:true,sourceFrameIndex:frame.presentedFrame};
 }
 async close(){await this.browser?.close();this.browser=null;this.page=null;this.camera=null;this.lastPresentedFrame=0}
}

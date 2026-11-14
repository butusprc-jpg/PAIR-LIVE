import type {Page} from 'playwright-core';

/** Capture pixels from a decoded video element, never from a browser upload. */
export async function captureDecodedVideo(page:Page,lastPresentedFrame:number){
 const video=page.locator('video:visible').first();
 await video.waitFor({state:'visible',timeout:10000});
 if(!Number.isSafeInteger(lastPresentedFrame)||lastPresentedFrame<0)throw new Error('invalid_frame_sequence');
 // A string is evaluated directly by Chromium, avoiding transpiler helpers in the page realm.
 const presentedFrame=await page.evaluate<number>(`(async()=>{
  const element=Array.from(document.querySelectorAll('video')).find(v=>v.getClientRects().length&&getComputedStyle(v).visibility!=='hidden');const last=${lastPresentedFrame};
  if(!element||element.readyState<2||!element.videoWidth||!element.videoHeight||element.paused||element.ended)throw new Error('camera_offline');
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(new Error('camera_stale')),8000);
   const next=(_time,metadata)=>metadata.presentedFrames>last?(clearTimeout(timer),resolve(metadata.presentedFrames)):element.requestVideoFrameCallback(next);
   element.requestVideoFrameCallback(next);
  });
 })()`);
 const image=Buffer.from(await video.screenshot({type:'png',timeout:10000}));
 if(image.length<24||!image.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new Error('invalid_camera_frame');
 return {image,presentedFrame,capturedAt:new Date().toISOString(),width:image.readUInt32BE(16),height:image.readUInt32BE(20)};
}

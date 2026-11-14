import test from 'node:test';
import assert from 'node:assert/strict';
import {captureLiveFrame,chooseLiveFrameSource,roiForFrame,validNormalizedRoi,type LiveCamera} from '../lib/ocr/live-frame-source';
import {captureDecodedVideo} from '../lib/ocr/playwright-video-frame';

const camera:LiveCamera={cameraId:'camera',oaId:'oa-1',siteId:'site',sourceKind:'VDO_NINJA',streamId:'stream_123',displayEnabled:true};
test('camera selection is scoped to OA and rejects unsupported adapters',()=>{
 const factory=()=>({kind:'VDO_NINJA' as const,async open(){},async capture(){throw Error('unused')},async close(){}});
 assert.equal(chooseLiveFrameSource(camera,'oa-1',{VDO_NINJA:factory}).kind,'VDO_NINJA');
 assert.throws(()=>chooseLiveFrameSource(camera,'oa-2',{VDO_NINJA:factory}),/live_camera_oa_or_state_mismatch/);
 assert.throws(()=>chooseLiveFrameSource({...camera,sourceKind:'RTSP_GATEWAY'},'oa-1',{VDO_NINJA:factory}),/live_camera_adapter_unavailable/);
});
test('normalized ROI maps to actual decoded pixels without escaping the frame',()=>{
 const roi={x:2500,y:2500,width:5000,height:5000};assert.equal(validNormalizedRoi(roi),true);
 assert.deepEqual(roiForFrame(roi,{width:1280,height:720}),{x:320,y:180,width:640,height:360});
 assert.equal(validNormalizedRoi({x:9000,y:0,width:2000,height:100}),false);
});
test('generic handoff rejects stale frames and closes the adapter',async()=>{
 let closed=false;const source={kind:'VDO_NINJA' as const,async open(){},async capture(){return {id:'frame',roundId:'0',source:'MOBILE_CAMERA' as const,capturedAt:new Date(1000).toISOString(),image:Buffer.alloc(30),width:100,height:100,healthy:true}},async close(){closed=true}};
 await assert.rejects(captureLiveFrame(source,camera,{x:0,y:0,width:5000,height:5000},()=>6001),/live_frame_stale_or_offline/);
 assert.equal(closed,true);
});
test('Playwright captures advancing decoded video frames without an uploaded image',async t=>{
 const {chromium}=await import('playwright-core');let browser;
 try{browser=await chromium.launch({executablePath:process.env.OCR_CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']})}catch(error){t.skip(`Chromium unavailable: ${String(error)}`);return}
 try{const page=await browser.newPage();await page.setContent(`<video autoplay muted playsinline width="320" height="180"></video><script>
 const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;const ctx=canvas.getContext('2d');let n=0;
 setInterval(()=>{ctx.fillStyle=n++%2?'#eee':'#111';ctx.fillRect(0,0,320,180)},70);
 const video=document.querySelector('video');video.srcObject=canvas.captureStream(15);video.play();
 </script>`);
 const first=await captureDecodedVideo(page,0),second=await captureDecodedVideo(page,first.presentedFrame);
 assert.ok(first.image.length>100);assert.equal(first.width,320);assert.equal(first.height,180);
 assert.ok(second.presentedFrame>first.presentedFrame);
 await page.evaluate('document.querySelector("video").pause()');
 await assert.rejects(captureDecodedVideo(page,second.presentedFrame),/camera_offline/);
 }finally{await browser.close()}
});

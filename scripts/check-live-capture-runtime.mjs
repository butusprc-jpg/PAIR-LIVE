import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright-core';

function command(name,args,input){const result=spawnSync(name,args,{input,encoding:input?undefined:'utf8',maxBuffer:4*1024*1024});if(result.status!==0)throw new Error(`${name}_unavailable`);return result.stdout}
command('chromium',['--version']);command('tesseract',['--version']);command('convert',['-version']);
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage','--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage({viewport:{width:320,height:180}});
 await page.setContent(`<video autoplay muted playsinline width="320" height="180"></video><script>
  const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;
  const ctx=canvas.getContext('2d');let n=0;
  setInterval(()=>{ctx.fillStyle='#d02020';ctx.fillRect(0,0,160,180);ctx.fillStyle='#2020d0';ctx.fillRect(160,0,160,180);ctx.fillStyle='#fff';ctx.fillRect((n++*17)%300,70,12,20)},70);
  const video=document.querySelector('video');video.srcObject=canvas.captureStream(15);video.play();
 </script>`);
 await page.waitForFunction('document.querySelector("video").readyState>=2');
 const video=page.locator('video');const first=await video.screenshot({type:'png'});
 await page.waitForTimeout(250);const second=await video.screenshot({type:'png'});
 if(createHash('sha256').update(first).digest('hex')===createHash('sha256').update(second).digest('hex'))throw new Error('video_pixels_not_advancing');
 const cropped=command('convert',['png:-','-crop','160x180+160+0','+repage','png:-'],second);
 const shape=String(command('identify',['-format','%wx%h','png:-'],cropped));
 if(shape!=='160x180')throw new Error('roi_dimensions_wrong');
 const sample=String(command('convert',['png:-','-format','%[fx:mean.b] %[fx:mean.r]','info:'],cropped)).trim().split(/\s+/).map(Number);
 if(!(sample[0]>sample[1]))throw new Error('roi_pixels_wrong');
 console.log('runtime_capture_roi_pass');
}finally{await browser.close()}

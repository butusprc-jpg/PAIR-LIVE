import {spawn} from 'node:child_process';
import type {Frame,OcrAdapter,OcrReading,Roi} from './core';

const MAX_INPUT=5*1024*1024,MAX_OUTPUT=5*1024*1024,PROCESS_TIMEOUT_MS=5000;
function runBounded(binary:string,args:string[],input:Buffer,outputLimit=MAX_OUTPUT):Promise<Buffer>{
 if(input.length>MAX_INPUT)throw new Error('ocr_input_too_large');
 return new Promise((resolve,reject)=>{
  const child=spawn(binary,args,{env:{...process.env,OMP_THREAD_LIMIT:'1'},stdio:['pipe','pipe','pipe']});
  const chunks:Buffer[]=[];let size=0,done=false;
  const finish=(error?:Error)=>{if(done)return;done=true;clearTimeout(timer);if(error)reject(error);else resolve(Buffer.concat(chunks))};
  const timer=setTimeout(()=>{child.kill('SIGKILL');finish(new Error('ocr_process_timeout'))},PROCESS_TIMEOUT_MS);
  child.stdout.on('data',(part:Buffer)=>{size+=part.length;if(size>outputLimit){child.kill('SIGKILL');finish(new Error('ocr_output_too_large'))}else chunks.push(part)});
  child.stderr.on('data',()=>{});
  child.on('error',()=>finish(new Error('ocr_process_unavailable')));
  child.on('close',code=>finish(code===0?undefined:new Error('ocr_process_failed')));
  child.stdin.on('error',()=>{});child.stdin.end(input);
 });
}
const convertBinary=process.platform==='win32'?'magick':'convert';
async function imageCommand(input:Buffer,args:string[]){return runBounded(convertBinary,['-limit','memory','128MiB','-limit','map','256MiB','-limit','time','5','-',...args,'png:-'],input)}
async function scalarMetric(image:Buffer,args:string[]){const output=await runBounded(convertBinary,['-limit','memory','128MiB','-limit','map','256MiB','-limit','time','5','-',...args,'-format','%[fx:mean]','info:'],image,1024);const value=Number(output.toString().trim());if(!Number.isFinite(value))throw new Error('image_metrics_failed');return value}
async function tesseract(image:Buffer){
 const output=await runBounded('tesseract',['stdin','stdout','--psm','7','-l','eng','-c','tessedit_char_whitelist=0123456789.','tsv'],image,256*1024);
 const lines=output.toString().trim().split('\n').slice(1).map(x=>x.split('\t'));
 const words=lines.filter(x=>x.length>=12&&Number(x[10])>=0&&x[11]?.trim());
 return {text:words.map(x=>x[11].trim()).join(' '),confidence:words.length?Math.min(...words.map(x=>Number(x[10]))):0};
}
async function imageMetrics(image:Buffer){const [edgeEnergy,brightFraction]=await Promise.all([scalarMetric(image,['-colorspace','Gray','-morphology','Convolve','Laplacian:0']),scalarMetric(image,['-colorspace','Gray','-threshold','95%'])]);
 // A mostly white sheet is the intended display surface, not a specular highlight.
 // OCR confidence and edge energy still reject a washed-out all-white frame.
 return {blurScore:edgeEnergy*100,glareFraction:brightFraction>.85?0:brightFraction}}

/** Camera-independent OCR: only the server-selected ROI reaches the engine. */
export class TesseractOcrAdapter implements OcrAdapter{
 async read(frame:Frame,roi:Roi):Promise<OcrReading>{
  if(!Number.isSafeInteger(frame.width)||!Number.isSafeInteger(frame.height)||frame.width*frame.height>2_000_000||frame.image.length>MAX_INPUT)throw new Error('ocr_frame_too_large');
  if(![roi.x,roi.y,roi.width,roi.height].every(Number.isSafeInteger)||roi.x<0||roi.y<0||roi.width<1||roi.height<1||roi.x+roi.width>frame.width||roi.y+roi.height>frame.height)throw new Error('invalid_roi');
  const crop=await imageCommand(frame.image,['-crop',`${roi.width}x${roi.height}+${roi.x}+${roi.y}`,'+repage']);
  const gray=await imageCommand(crop,['-colorspace','Gray','-contrast-stretch','1%x1%','-despeckle']);
  const result=await tesseract(gray),metrics=await imageMetrics(crop);
  return {frame,rawText:result.text,normalizedText:result.text.trim(),confidence:result.confidence,blurScore:metrics.blurScore,glareFraction:metrics.glareFraction,crop};
 }
}

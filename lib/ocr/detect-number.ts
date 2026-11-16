import type {Frame,Roi} from './core';
import {runBounded} from './engine';

type Box={text:string;confidence:number;x:number;y:number;width:number;height:number};
export type Detection={status:'FOUND';roi:Roi;label:string}|{status:'REVIEW_REQUIRED';reason:string};

/** Tesseract's layout pass locates numeric lines before the cropped OCR pass. */
export async function detectNumberRegion(frame:Frame):Promise<Detection>{
 if(frame.width<1||frame.height<1||frame.width*frame.height>2_000_000||frame.image.length>5*1024*1024)return {status:'REVIEW_REQUIRED',reason:'invalid_frame'};
 let output:Buffer;
 try{output=await runBounded('tesseract',['stdin','stdout','--psm','11','-l','eng','-c','tessedit_char_whitelist=0123456789.','tsv'],frame.image,256*1024)}
 catch{return {status:'REVIEW_REQUIRED',reason:'number_detection_failed'}}
 const groups=new Map<string,Box[]>();
 for(const line of output.toString().split('\n').slice(1)){
  const col=line.split('\t');if(col.length<12||col[0]!=='5')continue;
  const text=col.slice(11).join('\t').trim(),confidence=Number(col[10]);
  const [x,y,width,height]=[col[6],col[7],col[8],col[9]].map(Number);
  if(!text||!/^[0-9.]+$/.test(text)||!Number.isFinite(confidence)||confidence<35||![x,y,width,height].every(Number.isFinite)||width<2||height<2)continue;
  const key=col.slice(1,5).join(':');groups.set(key,[...(groups.get(key)||[]),{text,confidence,x,y,width,height}]);
 }
 const candidates=[...groups.values()].map(words=>{
  const text=words.map(w=>w.text).join('');const x=Math.min(...words.map(w=>w.x)),y=Math.min(...words.map(w=>w.y));
  return {text,x,y,width:Math.max(...words.map(w=>w.x+w.width))-x,height:Math.max(...words.map(w=>w.y+w.height))-y};
 }).filter(c=>/^\d+(?:\.\d+)?$/.test(c.text)&&c.x>=0&&c.y>=0&&c.x+c.width<=frame.width&&c.y+c.height<=frame.height)
  .sort((a,b)=>b.height-a.height||b.width-a.width);
 if(!candidates.length)return {status:'REVIEW_REQUIRED',reason:'number_not_found'};
 const best=candidates[0],next=candidates[1];
 if(next&&(best.height<next.height*1.6||best.width*best.height<next.width*next.height*1.5))return {status:'REVIEW_REQUIRED',reason:'multiple_number_groups'};
 const padX=Math.max(8,Math.round(best.height*.25)),padY=Math.max(6,Math.round(best.height*.35));
 const x=Math.max(0,best.x-padX),y=Math.max(0,best.y-padY),right=Math.min(frame.width,best.x+best.width+padX),bottom=Math.min(frame.height,best.y+best.height+padY);
 return {status:'FOUND',roi:{x,y,width:right-x,height:bottom-y},label:best.text};
}

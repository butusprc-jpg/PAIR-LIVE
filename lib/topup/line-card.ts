import {createHmac,timingSafeEqual} from 'node:crypto';
import {TopupError,uuid} from './store';

export type Decision='APPROVED'|'REJECTED';
const IMAGE_TTL_SECONDS=24*60*60;
const CONFIRM_TTL_SECONDS=5*60;
function secret(){const s=process.env.TOPUP_IMAGE_SIGNING_SECRET;if(!s||Buffer.byteLength(s)<32)throw new TopupError('topup_signing_not_configured',503);return s}
function signature(payload:string){return createHmac('sha256',secret()).update(payload).digest('hex')}
function equalSignature(received:string,expected:string){if(!/^[a-f0-9]{64}$/.test(received))return false;return timingSafeEqual(Buffer.from(received,'hex'),Buffer.from(expected,'hex'))}
export function signedSlipUrl(origin:string,requestId:string,now=Date.now(),deadline?:Date|string){
 if(!uuid(requestId))throw new TopupError('invalid_request_id');const u=new URL(origin);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash)throw new TopupError('invalid_public_origin',503);
 const expires=Math.min(Math.floor(now/1000)+IMAGE_TTL_SECONDS,deadline?Math.floor(new Date(deadline).getTime()/1000)+IMAGE_TTL_SECONDS:Number.MAX_SAFE_INTEGER);
 if(expires<=Math.floor(now/1000))throw new TopupError('slip_expired',410);
 const image=new URL('/api/line/topup-image',u);image.searchParams.set('id',requestId);image.searchParams.set('exp',String(expires));image.searchParams.set('sig',signature(`slip|${requestId}|${expires}`));return image.toString();
}
export function validSlipLink(id:string,exp:string,sig:string,now=Date.now()){
 if(!uuid(id)||!/^[0-9]{10,11}$/.test(exp))return false;
 const expires=Number(exp);if(expires<Math.floor(now/1000)||expires>Math.floor(now/1000)+IMAGE_TTL_SECONDS)return false;
 return equalSignature(sig,signature(`slip|${id}|${exp}`));
}
export function reviewData(id:string,decision:Decision){if(!uuid(id))throw new TopupError('invalid_request_id');return `topup:v2:review:${decision}:${id}`}
export function confirmationData(id:string,decision:Decision,actor:string,now=Date.now()){
 if(!uuid(id)||!/^U[0-9a-f]{32}$/i.test(actor))throw new TopupError('invalid_confirmation');
 const exp=Math.floor(now/1000)+CONFIRM_TTL_SECONDS;
 const payload=`topup:v2:confirm:${decision}:${id}:${exp}`;
 return `${payload}:${signature(`${payload}:${actor}`)}`;
}
export function parsePostback(data:string,actor:string,now=Date.now()):{stage:'REVIEW'|'CONFIRM'|'CANCEL';decision?:Decision;id?:string}|null{
 if(data==='topup:v2:cancel')return {stage:'CANCEL'};
 const r=/^topup:v2:review:(APPROVED|REJECTED):([0-9a-f-]{36})$/i.exec(data);
 if(r&&uuid(r[2]))return {stage:'REVIEW',decision:r[1] as Decision,id:r[2]};
 const c=/^topup:v2:confirm:(APPROVED|REJECTED):([0-9a-f-]{36}):([0-9]{10,11}):([0-9a-f]{64})$/i.exec(data);
 if(!c||!uuid(c[2])||!/^U[0-9a-f]{32}$/i.test(actor))return null;
 const expires=Number(c[3]);if(expires<Math.floor(now/1000)||expires>Math.floor(now/1000)+CONFIRM_TTL_SECONDS)return null;
 const payload=`topup:v2:confirm:${c[1]}:${c[2]}:${c[3]}`;
 return equalSignature(c[4],signature(`${payload}:${actor}`))?{stage:'CONFIRM',decision:c[1] as Decision,id:c[2]}:null;
}
export type CardRow={id:string;displayName:string;points:number;createdAt:Date|string;status:string};
function label(text:string,value:string){return {type:'box',layout:'baseline',contents:[{type:'text',text,size:'sm',color:'#737B8C',flex:3},{type:'text',text:value,size:'sm',color:'#18223A',flex:7,wrap:true}]}}
function card(row:CardRow,title:string,bodyExtra:unknown[]=[],footer:unknown[]=[],hero?:string){
 const name=row.displayName.replace(/[\r\n\t]/g,' ').slice(0,80)||'ไม่ทราบชื่อ';
 const when=new Date(row.createdAt).toLocaleString('th-TH',{timeZone:'Asia/Bangkok',dateStyle:'medium',timeStyle:'short'});
 return {type:'flex',altText:`PAIR LIVE · ${title} · ${name} · ${row.points} แต้ม`,contents:{type:'bubble',size:'mega',
  ...(hero?{hero:{type:'image',url:hero,size:'full',aspectRatio:'4:5',aspectMode:'fit',backgroundColor:'#F3F5F9'}}:{}),
  body:{type:'box',layout:'vertical',spacing:'md',contents:[{type:'text',text:'PAIR LIVE — '+title,weight:'bold',size:'lg',wrap:true},label('สมาชิก',name),label('จำนวนเติม',`${row.points.toLocaleString('th-TH')} แต้ม`),label('ส่งเมื่อ',when),label('เลขคำขอ',row.id),label('สถานะ',row.status),...bodyExtra]},
  ...(footer.length?{footer:{type:'box',layout:'vertical',spacing:'sm',contents:footer}}:{})}};
}
function button(text:string,data:string,style:'primary'|'secondary'='secondary'){return {type:'button',style,...(style==='primary'?{color:'#1763DC'}:{}),height:'sm',action:{type:'postback',label:text,data,displayText:text}}}
export function requestCard(row:CardRow,slipUrl?:string,expired=false){
 const footer=slipUrl?[button(`✅ ยืนยัน ${row.points} แต้ม`,reviewData(row.id,'APPROVED'),'primary'),button('❌ ปฏิเสธ',reviewData(row.id,'REJECTED'))]:[];
 const extra=slipUrl?[]:[{type:'text',text:expired?'ภาพสลิปหมดอายุแล้ว กรุณาตรวจสอบตามกระบวนการก่อนดำเนินการ':'⚠️ ภาพสลิปโหลดไม่ได้ กรุณาตรวจสอบในระบบก่อนดำเนินการ',color:'#B54138',size:'sm',wrap:true}];
 return card(row,'แจ้งเติมแต้ม',extra,footer,slipUrl);
}
export function confirmationCard(row:CardRow,decision:Decision,actor:string){
 return card(row,decision==='APPROVED'?'ยืนยันการเติมแต้ม':'ยืนยันการปฏิเสธ',[],[
 button(decision==='APPROVED'?`ยืนยันการอนุมัติ ${row.points} แต้ม`:'ยืนยันการปฏิเสธ',confirmationData(row.id,decision,actor),'primary'),button('ยกเลิก','topup:v2:cancel')]);
}
export function resultMessage(row:CardRow,decision:Decision,adminName:string,already=false){
 const status=decision==='APPROVED'?'✅ อนุมัติเติมแต้มสำเร็จ':'❌ ปฏิเสธคำขอเติมแต้ม';
 return {type:'text',text:`${already?'รายการนี้ดำเนินการแล้ว':'PAIR LIVE — '+status}\nสมาชิก: ${row.displayName.slice(0,80)}\nจำนวน: ${decision==='APPROVED'?'+':''}${row.points.toLocaleString('th-TH')} แต้ม\nสถานะ: ${decision}\nเลขคำขอ: ${row.id}${already?'':`\nผู้ดำเนินการ: ${adminName.slice(0,80)}`}`};
}

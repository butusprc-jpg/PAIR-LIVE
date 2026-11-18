import {createHmac,timingSafeEqual} from 'node:crypto';
import {TopupError,uuid} from './store';
import {t,formatDate,type Locale} from '../i18n';

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
function card(row:CardRow,title:string,bodyExtra:unknown[]=[],footer:unknown[]=[],hero?:string,locale:Locale='th'){
 if(!uuid(row.id)||!Number.isSafeInteger(row.points)||row.points<1||typeof row.displayName!=='string')throw new TopupError('invalid_line_card_input');
 const name=row.displayName.replace(/[\r\n\t]/g,' ').slice(0,80)||t('line.topup.card.unknownName',locale);
 const when=formatDate(row.createdAt,locale,{dateStyle:'medium',timeStyle:'short'});
 const points=row.points.toLocaleString('th-TH');
 const localizedStatus:Record<string,string>={PENDING:'line.topup.card.pending',APPROVED:'line.topup.card.approvedStatus',REJECTED:'line.topup.card.rejectedStatus','รอตรวจสอบ':'line.topup.card.pending','อนุมัติแล้ว':'line.topup.card.approvedStatus','ปฏิเสธแล้ว':'line.topup.card.rejectedStatus'};
 if(!Object.hasOwn(localizedStatus,row.status))throw new TopupError('invalid_line_card_status');
 return {type:'flex',altText:`PAIR LIVE · ${title} · ${name} · ${t('line.topup.card.pointsValue',locale,{points})}`,contents:{type:'bubble',size:'mega',
  ...(hero?{hero:{type:'image',url:hero,size:'full',aspectRatio:'4:5',aspectMode:'fit',backgroundColor:'#F3F5F9'}}:{}),
  body:{type:'box',layout:'vertical',spacing:'md',contents:[{type:'text',text:'PAIR LIVE — '+title,weight:'bold',size:'lg',wrap:true},label(t('line.topup.card.member',locale),name),label(t('line.topup.card.points',locale),t('line.topup.card.pointsValue',locale,{points})),label(t('line.topup.card.sentAt',locale),when),label(t('line.topup.card.requestId',locale),row.id),label(t('line.topup.card.status',locale),localizedStatus[row.status]?t(localizedStatus[row.status],locale):row.status),...bodyExtra]},
  ...(footer.length?{footer:{type:'box',layout:'vertical',spacing:'sm',contents:footer}}:{})}};
}
function button(text:string,data:string,style:'primary'|'secondary'='secondary'){return {type:'button',style,...(style==='primary'?{color:'#1763DC'}:{}),height:'sm',action:{type:'postback',label:text,data}}}
export function requestCard(row:CardRow,slipUrl?:string,expired=false,manualChatSlip=false,locale:Locale='th'){
 const extra=slipUrl?[]:[{type:'text',text:t(expired?'line.topup.card.expiredSlip':'line.topup.card.reviewSlip',locale),color:'#737B8C',size:'sm',wrap:true}];
 const footer=[
  button(t('line.topup.card.approveButton',locale),reviewData(row.id,'APPROVED'),'primary'),
  button(t('line.topup.card.rejectButton',locale),reviewData(row.id,'REJECTED'))
 ];
 return card(row,t('line.topup.card.requestTitle',locale),extra,footer,slipUrl,locale);
}
export function confirmationCard(row:CardRow,decision:Decision,actor:string,locale:Locale='th'){
 return card(row,t(decision==='APPROVED'?'line.topup.card.confirmApprove':'line.topup.card.confirmReject',locale),[{type:'text',text:t('line.topup.card.confirmNote',locale),size:'sm',wrap:true,color:'#B54138'}],[
 button(t(decision==='APPROVED'?'line.topup.card.approveButton':'line.topup.card.rejectConfirmButton',locale),confirmationData(row.id,decision,actor),'primary'),button(t('line.topup.card.cancelButton',locale),'topup:v2:cancel')],undefined,locale);
}
export function resultMessage(row:CardRow,decision:Decision,adminName:string,already=false){
 const status=decision==='APPROVED'?'✅ อนุมัติเติมแต้มสำเร็จ':'❌ ปฏิเสธคำขอเติมแต้ม';
 return {type:'text',text:`${already?'รายการนี้ดำเนินการแล้ว':'PAIR LIVE — '+status}\nสมาชิก: ${row.displayName.slice(0,80)}\nจำนวน: ${decision==='APPROVED'?'+':''}${row.points.toLocaleString('th-TH')} แต้ม\nสถานะ: ${decision}\nเลขคำขอ: ${row.id}${already?'':`\nผู้ดำเนินการ: ${adminName.slice(0,80)}`}`};
}

export function statusCard(row:CardRow,locale:Locale='th'){
 if(row.status!=='APPROVED'&&row.status!=='REJECTED')throw new TopupError('invalid_line_card_status');
 const approved=row.status==='APPROVED';
 return card(row,t(approved?'line.topup.card.approved':'line.topup.card.rejected',locale),[],[],undefined,locale);
}

import type {NotificationEvent} from './notification-types';
function value(event:NotificationEvent,key:string){const v=event.payload[key];return v===null||v===undefined?'รอตรวจสอบ':String(v)}
function escapeHtml(value:string){return value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))}
export function formatNotification(event:NotificationEvent):{text:string;html:string;subject:string}{
 const round=event.roundId||value(event,'roundId');let text:string;
 switch(event.type){
  case 'ROUND_CLOSED':text=`รอบ ${round} ปิดรับแล้ว\nเปิด ${value(event,'opensAt')} · ปิด ${value(event,'closesAt')}\nรออ่านเลขจากกล้อง`;break;
  case 'ROUND_SETTLED':text=`ยืนยันผลรอบ ${round}\nเลข OCR ${value(event,'resultNumber')} · หลักสุดท้าย ${value(event,'lastDigit')} · ${value(event,'parity')}\nคู่: สมาชิก ${value(event,'evenMembers')} รายการ ${value(event,'evenEntries')} คะแนน ${value(event,'evenPoints')}\nคี่: สมาชิก ${value(event,'oddMembers')} รายการ ${value(event,'oddEntries')} คะแนน ${value(event,'oddPoints')}\nหลักฐานภาพ ${value(event,'evidenceStatus')}`;break;
  case 'OCR_REVIEW_REQUIRED':text=`รอบ ${round} อ่าน OCR ไม่สำเร็จ: ${value(event,'reason')}\nREVIEW_REQUIRED · โปรดตรวจสอบ`;break;
  case 'DAILY_SUMMARY':text=`สรุปวันที่ ${event.date||value(event,'date')}\nรอบ ${value(event,'rounds')} · ยืนยัน ${value(event,'settled')} · สมาชิก ${value(event,'members')} · คะแนน ${value(event,'points')} · รอตรวจสอบ ${value(event,'review')}`;break;
  default:text=`ระบบแจ้งเหตุ ${event.type}: ${value(event,'reason')} · ${event.occurredAt}`;
 }
 const subject=event.type==='DAILY_SUMMARY'?`PAIR LIVE สรุปรายวัน ${event.date||''}`:`PAIR LIVE แจ้งเตือน ${event.type} ${round}`;
 return {text,html:`<p>${escapeHtml(text).replace(/\n/g,'<br>')}</p>`,subject};
}

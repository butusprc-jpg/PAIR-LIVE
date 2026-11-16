import {t,type Locale} from './i18n';

export function memberError(error:string,locale:Locale){
 const exact:Record<string,string>={
  'ยังไม่เปิดรับคำทาย':'member.error.roundClosed',
  'กรุณาเลือกคู่หรือคี่':'member.error.chooseSide',
  'กรุณากรอกแต้มจำนวนเต็มมากกว่า 0':'member.error.positivePoints',
  'ยังไม่สามารถตรวจยอดแต้มได้ กรุณาลองใหม่':'member.error.balanceUnavailable',
  'แต้มไม่เพียงพอ':'wallet.insufficient',
  'ส่งรายการไม่สำเร็จ':'member.error.entryFailed',
  'การเชื่อมต่อขัดข้อง':'member.error.connection',
  'โหลดประวัติแต้มไม่ได้':'member.error.walletHistory',
  'บันทึกการแจ้งเตือนไม่สำเร็จ':'member.error.notification',
 };
 const range=/^กรุณากรอกแต้มตั้งแต่ ([\d,]+) ถึง ([\d,]+) แต้ม$/.exec(error);
 if(range)return t('member.error.pointRange',locale,{min:range[1],max:range[2]});
 if(exact[error])return t(exact[error],locale);
 return /^[a-z][a-z0-9_]*$/i.test(error)?t('member.error.generic',locale):error;
}

export function memberSide(side:'คู่'|'คี่',locale:Locale){return t(side==='คู่'?'round.even':'round.odd',locale)}

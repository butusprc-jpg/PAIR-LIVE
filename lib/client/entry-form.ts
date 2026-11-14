export type EntrySide='คู่'|'คี่'|null;

export function entryFormError(input:{open:boolean;side:EntrySide;points:string;balance:number;min:number;max:number;walletMode:'loading'|'wallet'|'legacy'|'error';frozen:boolean}):string|null{
 if(!input.open)return 'ยังไม่เปิดรับคำทาย';
 if(!input.side)return 'กรุณาเลือกคู่หรือคี่';
 const count=Number(input.points);
 if(!input.points.trim()||!Number.isInteger(count)||count<1)return 'กรุณากรอกแต้มจำนวนเต็มมากกว่า 0';
 if(count<input.min||count>input.max)return `กรุณากรอกแต้มตั้งแต่ ${input.min.toLocaleString()} ถึง ${input.max.toLocaleString()} แต้ม`;
 if(input.walletMode==='loading'||input.walletMode==='error'||input.frozen)return 'ยังไม่สามารถตรวจยอดแต้มได้ กรุณาลองใหม่';
 if(count>input.balance)return 'แต้มไม่เพียงพอ';
 return null;
}

export function validMemberId(id:unknown):id is string{return typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)}
export function validPoints(n:unknown):n is number{return typeof n==='number'&&Number.isSafeInteger(n)&&n>0&&n<=1_000_000}
export function validAdjustmentPoints(n:unknown):n is number{return typeof n==='number'&&Number.isSafeInteger(n)&&n!==0&&Math.abs(n)<=1_000_000}
export function validReference(s:unknown):s is string{return typeof s==='string'&&s.length>0&&s.length<=180&&/^[A-Za-z0-9:_-]+$/.test(s)}
export function validKey(s:unknown):s is string{return typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)}

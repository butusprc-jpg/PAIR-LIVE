'use client';

// The original QR image is already visible in MemberTopup. LINE's embedded
// browser handles long-press actions on that ordinary image itself.
// No download script, popup, share dialog, or enlarged duplicate.
export function SaveTopupQr({version: _version}:{version:number}){
 return <p className="muted">แตะค้างที่ภาพ QR Code ด้านบน แล้วเลือก “บันทึกรูปภาพ”</p>;
}

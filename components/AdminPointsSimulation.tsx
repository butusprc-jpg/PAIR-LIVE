'use client';
import {useEffect,useState} from 'react';
import {settlementRateFromAdminFee} from '../lib/rounds/admin-fee';
import {addSimulationEntry,calculateSimulation,closeSimulationRound,createSimulationRound,type SimulationRound} from '../lib/rounds/points-simulation';

type Ocr={status:string;number?:string;reason?:string}|null;
type Report=ReturnType<typeof calculateSimulation>;
const thai=(side:'even'|'odd')=>side==='even'?'คู่':'คี่';
export default function AdminPointsSimulation({ocr,canEdit}:{ocr:Ocr;canEdit:boolean}){
 const [round,setRound]=useState<SimulationRound|null>(null),[report,setReport]=useState<Report|null>(null),[message,setMessage]=useState(''),[now,setNow]=useState(Date.now());
 const [name,setName]=useState(''),[before,setBefore]=useState('1000'),[side,setSide]=useState<'even'|'odd'>('odd'),[stake,setStake]=useState('100');
 const [manualNumber,setManualNumber]=useState(''),[confirmed,setConfirmed]=useState(false);
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer)},[]);
 useEffect(()=>{setReport(null);setConfirmed(false);setManualNumber('')},[ocr]);
 useEffect(()=>{if(round?.status==='OPEN'&&now>=Date.parse(round.closesAt))setRound(old=>old?.status==='OPEN'?closeSimulationRound(old,now):old)},[now,round]);
 async function create(){try{
  const [rulesResponse,businessResponse,settingsResponse]=await Promise.all(['/api/admin/settings/rules','/api/admin/settings/business','/api/admin/settings'].map(url=>fetch(url,{credentials:'same-origin',cache:'no-store'})));
  if(!rulesResponse.ok||!businessResponse.ok||!settingsResponse.ok)throw Error('อ่านกติกาปัจจุบันไม่ได้');
  const [rules,business,settings]=await Promise.all([rulesResponse.json(),businessResponse.json(),settingsResponse.json()]);
  const fee=business.settings?.adminFeeRate;if(typeof fee!=='string')throw Error('ยังไม่กำหนดอัตราค่าดูแลระบบ จึงคำนวณอัตราจ่ายจริงไม่ได้');
  const rate=settlementRateFromAdminFee(fee);
  const next=createSimulationRound(`SIM-${crypto.randomUUID()}`,{minEntryPoints:rules.minEntryPoints,maxEntryPoints:rules.maxEntryPoints,maxRoundPoints:business.settings.maxRoundPoints,rateNumerator:rate.numerator,rateDenominator:rate.denominator,adminFeeRate:fee,durationMinutes:settings.durationMinutes},Date.now());
  setRound(next);setReport(null);setMessage('สร้างรอบจำลองแล้ว กติกาและอัตราจ่ายถูกตรึงสำหรับรอบนี้');
 }catch(error){setMessage(error instanceof Error?error.message:'สร้างรอบจำลองไม่สำเร็จ')}}
 function add(){if(!round)return;try{const next=addSimulationEntry(round,{id:crypto.randomUUID(),name,before:Number(before),side,stake:Number(stake)},Date.now());setRound(next);setName('');setMessage('รับรายการจำลองแล้ว ยอดจริงไม่เปลี่ยน')}catch(error){setMessage(error instanceof Error?error.message:'รับรายการไม่สำเร็จ')}}
 function addExample(){if(!round||round.entries.length)return;try{let next=round;for(const [name,side,stake] of [['A','odd',100],['B','even',50],['C','odd',200],['D','even',100]] as const)next=addSimulationEntry(next,{id:crypto.randomUUID(),name,before:1000,side,stake},Date.now());setRound(next);setMessage('เพิ่มสมาชิกสมมติ A–D แล้ว')}catch(error){setMessage(error instanceof Error?error.message:'เพิ่มตัวอย่างไม่สำเร็จ')}}
 function close(){if(!round)return;setRound(closeSimulationRound(round,Date.now(),true));setReport(null);setMessage('จำลองเวลาหมดและปิดรับรายการแล้ว')}
 function calculate(){if(!round||!ocr)return;try{const number=ocr.status==='READ'?ocr.number||'':manualNumber.trim();const result=calculateSimulation(round,number,confirmed,ocr.status);setReport(result);setMessage('คำนวณจากข้อมูลจำลองเท่านั้น ไม่มีรายการจริงถูกสร้าง')}catch(error){setMessage(error instanceof Error?error.message:'คำนวณไม่ได้')}}
 function clear(){setRound(null);setReport(null);setManualNumber('');setConfirmed(false);setMessage('ล้างข้อมูลจำลองแล้ว')}
 const closed=round?.status==='CLOSED';
 return <section className="card" aria-label="จำลองตัดแต้มและแจกแต้ม"><h3>จำลองตัดแต้ม / แจกแต้ม</h3><strong>SIMULATION ONLY — ไม่มีการตัดหรือแจกแต้มจริง</strong><p className="muted">ใช้สมาชิกสมมติเท่านั้น กติกาจากการตั้งค่าปัจจุบันถูกตรึงเมื่อสร้างรอบจำลอง</p>
  <div className="camera-controls"><button type="button" className="secondary" disabled={!canEdit} onClick={()=>void create()}>สร้างรอบทดสอบ</button><button type="button" className="secondary" disabled={!round} onClick={clear}>ล้างข้อมูลจำลอง</button></div>
  {round&&<><p>รอบ {round.id} · {round.status==='OPEN'?'เปิดรับรายการ':'ปิดรับรายการ'} · หมดเวลา {new Date(round.closesAt).toLocaleTimeString('th-TH',{timeZone:'Asia/Bangkok'})}</p><p>กติกา: ลงแต้ม {round.rules.minEntryPoints}–{round.rules.maxEntryPoints} ต่อรายการ · เพดานรอบ {round.rules.maxRoundPoints??'ไม่กำหนด'} · ค่าดูแล {round.rules.adminFeeRate}% · อัตราคืนรวมเดิมพัน {round.rules.rateNumerator}/{round.rules.rateDenominator} (ปัดเศษลงต่อรายการ)</p>
   {round.status==='OPEN'&&<><div className="camera-controls"><label>สมาชิกสมมติ<input className="field" value={name} maxLength={50} onChange={event=>setName(event.target.value)}/></label><label>แต้มก่อนลง<input className="field" type="number" min="0" value={before} onChange={event=>setBefore(event.target.value)}/></label><label>เลือก<select className="field" value={side} onChange={event=>setSide(event.target.value as 'even'|'odd')}><option value="even">คู่</option><option value="odd">คี่</option></select></label><label>ลงแต้ม<input className="field" type="number" min="1" value={stake} onChange={event=>setStake(event.target.value)}/></label></div><div className="camera-controls"><button type="button" className="secondary" onClick={add}>รับรายการจำลอง</button><button type="button" className="secondary" disabled={round.entries.length>0} onClick={addExample}>เพิ่มตัวอย่าง A–D</button><button type="button" className="secondary" onClick={close}>จำลองเวลาหมดและปิดรับ</button></div></>}
   <p>สมาชิกจำลอง {round.entries.length} คน · ลงแต้มรวม {round.entries.reduce((sum,item)=>sum+item.stake,0)}</p>
   {round.entries.length>0&&<div style={{overflowX:'auto'}}><table><thead><tr><th>สมาชิกสมมติ</th><th>เลือก</th><th>แต้มก่อน</th><th>ลงแต้ม</th><th>หลังหัก</th></tr></thead><tbody>{round.entries.map(item=><tr key={item.id}><td>{item.name}</td><td>{thai(item.side)}</td><td>{item.before}</td><td>{item.stake}</td><td>{item.before-item.stake}</td></tr>)}</tbody></table></div>}
   {closed&&<><p>ผล OCR: {ocr?.number||'อ่านไม่ได้'} · {ocr?.status||'ยังไม่อ่าน'}{ocr?.reason?` (${ocr.reason})`:''}</p>{ocr&&ocr.status!=='READ'&&<><p className="muted">ผล OCR ยังไม่ผ่านเกณฑ์ ระบุเลขและยืนยันเพื่อใช้เฉพาะการจำลอง ผลนี้ไม่ยืนยันรอบจริง</p><label>เลขสำหรับการจำลอง<input className="field" value={manualNumber} onChange={event=>setManualNumber(event.target.value)} placeholder="เช่น 5.8343"/></label><label><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/> ยืนยันผลเฉพาะ Simulation</label></>}<button className="primary" type="button" disabled={!ocr||round.entries.length===0||ocr.status!=='READ'&&!confirmed} onClick={calculate}>คำนวณจำลอง</button></>}
  </>}
  {report&&<><h4>รายงานรอบ {report.roundId}</h4><p>{report.number} → เลขท้าย {report.lastDigit} → {report.parity==='EVEN'?'คู่':'คี่'} · สมาชิก {report.memberCount} · ชนะ {report.winners} · แพ้ {report.losers}</p><p>ยอดก่อน {report.totalBefore} · หักเดิมพัน {report.totalStaked} · จ่ายรางวัล {report.totalAwards} · ยอดหลัง {report.totalAfter} · สุทธิระบบ {report.systemNet}</p><div style={{overflowX:'auto'}}><table><thead><tr><th>สมาชิกสมมติ</th><th>เลือก</th><th>ก่อน</th><th>หัก</th><th>ผล</th><th>รางวัล</th><th>หลัง</th></tr></thead><tbody>{report.members.map(item=><tr key={item.id}><td>{item.name}</td><td>{thai(item.side)}</td><td>{item.before}</td><td>{item.deducted}</td><td>{item.won?'ชนะ':'แพ้'}</td><td>{item.award}</td><td>{item.after}</td></tr>)}</tbody></table></div></>}
  {message&&<p role="status">{message}</p>}
 </section>;
}

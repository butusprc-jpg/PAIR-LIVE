/** Pure presentation only. Never use a preview to trigger settlement or LINE delivery. */
export type ResultNotice={
  roundId:string;
  resultNumber:string;
  chosenSide:'even'|'odd';
  stakePoints:number;
  outcome:'CORRECT'|'INCORRECT';
  /** Total credited after settlement, inclusive of stake. Required for winners. */
  creditedPoints?:number;
};
export function resultParity(resultNumber:string):'even'|'odd'{
  if(!/^\d+(?:\.\d+)?$/.test(resultNumber))throw new Error('invalid_result_number');
  const digit=resultNumber[resultNumber.length-1];
  return Number(digit)%2===0?'even':'odd';
}
function points(value:number){if(!Number.isSafeInteger(value)||value<0)throw new Error('invalid_points');return value.toLocaleString('th-TH')}
export function resultNoticeText(notice:ResultNotice){
  if(!/^\d+$/.test(notice.roundId)||!Number.isSafeInteger(notice.stakePoints)||notice.stakePoints<1)throw new Error('invalid_result_notice');
  const actual=resultParity(notice.resultNumber);
  if((actual===notice.chosenSide)!==(notice.outcome==='CORRECT'))throw new Error('result_outcome_mismatch');
  if(notice.outcome==='CORRECT'&&(notice.creditedPoints===undefined||notice.creditedPoints<1))throw new Error('unconfirmed_payout');
  if(notice.outcome==='INCORRECT'&&notice.creditedPoints!==undefined&&notice.creditedPoints!==0)throw new Error('unconfirmed_payout');
  const side=(value:'even'|'odd')=>value==='even'?'คู่':'คี่';
  return [
    'PAIR LIVE — ผลการทาย',
    '',
    notice.outcome==='CORRECT'?'ยินดีด้วย! คุณทายถูก':'ผลการทาย: ทายผิด',
    `รอบที่ ${notice.roundId}`,
    `ผลออกรางวัล: ${notice.resultNumber} (${side(actual)})`,
    `คุณทาย: ${side(notice.chosenSide)}`,
    `จำนวนที่ทาย: ${points(notice.stakePoints)} แต้ม`,
    notice.outcome==='CORRECT'?`แต้มที่ได้รับรวมทุน: ${points(notice.creditedPoints!)} แต้ม`:'แต้มที่ได้รับ: 0 แต้ม',
    ...(notice.outcome==='CORRECT'?[`รวมยอดทั้งหมด: ${points(notice.creditedPoints!)} แต้ม`]:[]),
    `สถานะ: ${notice.outcome==='CORRECT'?'ทายถูก ✅':'ทายผิด ❌'}`
  ].join('\n');
}
/** LINE Flex bubble; use only after an authenticated, committed settlement. */
export function resultNoticeCard(notice:ResultNotice){
  const winning=notice.outcome==='CORRECT';
  const txt=resultNoticeText(notice);
  const rows=txt.split('\n').filter(Boolean);
  return {
    type:'flex' as const,
    altText:winning?`PAIR LIVE ทายถูก รอบ ${notice.roundId}`:`PAIR LIVE ทายผิด รอบ ${notice.roundId}`,
    contents:{
      type:'bubble' as const,
      size:'mega' as const,
      header:{type:'box' as const,layout:'vertical' as const,backgroundColor:winning?'#12683F':'#374151',paddingAll:'18px',contents:[{
        type:'text' as const,text:rows[0],weight:'bold' as const,color:'#FFFFFF',size:'md' as const,wrap:true
      }]},
      body:{type:'box' as const,layout:'vertical' as const,paddingAll:'18px',spacing:'md' as const,contents:rows.slice(1).map(line=>({
        type:'text' as const,text:line,size:'sm' as const,wrap:true,color:'#243047'
      }))}
    }
  };
}
export function cameraStartedNotice(cameraName?:string){
 const label=cameraName?.trim();
 return `📹 PAIR LIVE — เริ่มถ่ายทอดสดแล้ว${label? `\\nกล้อง: ${label.slice(0,80)}`:''}\\nเปิดหน้าห้อง LIVE เพื่อรับชม`;
}

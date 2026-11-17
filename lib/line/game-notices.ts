import {t,type Locale} from '../i18n';
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
export function resultNoticeText(notice:ResultNotice,locale:Locale='th'){
  if(!/^\d+$/.test(notice.roundId)||!Number.isSafeInteger(notice.stakePoints)||notice.stakePoints<1)throw new Error('invalid_result_notice');
  const actual=resultParity(notice.resultNumber);
  if((actual===notice.chosenSide)!==(notice.outcome==='CORRECT'))throw new Error('result_outcome_mismatch');
  if(notice.outcome==='CORRECT'&&(notice.creditedPoints===undefined||notice.creditedPoints<1))throw new Error('unconfirmed_payout');
  if(notice.outcome==='INCORRECT'&&notice.creditedPoints!==undefined&&notice.creditedPoints!==0)throw new Error('unconfirmed_payout');
  const side=(value:'even'|'odd')=>t(value==='even'?'line.side.even':'line.side.odd',locale);
  return [
    t('line.result.title',locale),'',
    t(notice.outcome==='CORRECT'?'line.result.win':'line.result.lose',locale),
    t('line.result.round',locale,{round:notice.roundId}),
    t('line.result.number',locale,{number:notice.resultNumber,side:side(actual)}),
    t('line.result.chosen',locale,{side:side(notice.chosenSide)}),
    t('line.result.stake',locale,{points:points(notice.stakePoints)}),
    notice.outcome==='CORRECT'?t('line.result.credit',locale,{points:points(notice.creditedPoints!)}):t('line.result.zero',locale),
    ...(notice.outcome==='CORRECT'?[t('line.result.total',locale,{points:points(notice.creditedPoints!)})]:[]),
    t('line.result.status',locale,{status:t(notice.outcome==='CORRECT'?'line.result.winStatus':'line.result.loseStatus',locale)})
  ].join('\n');
}
/** LINE Flex bubble; use only after an authenticated, committed settlement. */
export function resultNoticeCard(notice:ResultNotice,locale:Locale='th'){
  const winning=notice.outcome==='CORRECT';
  const txt=resultNoticeText(notice,locale);
  const rows=txt.split('\n').filter(Boolean);
  return {
    type:'flex' as const,
    altText:t(winning?'line.result.altWin':'line.result.altLose',locale,{round:notice.roundId}),
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

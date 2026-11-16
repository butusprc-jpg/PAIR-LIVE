import {RoundError,validateEntry} from './core';
import {roundAwardPoints} from './payout';
import {settlementRateFromAdminFee} from './admin-fee';

export type SimulationRules={minEntryPoints:number;maxEntryPoints:number;maxRoundPoints:number|null;rateNumerator:number;rateDenominator:number;adminFeeRate:string;durationMinutes:number};
export type SimulationEntry={id:string;name:string;before:number;side:'even'|'odd';stake:number};
export type SimulationRound={id:string;status:'OPEN'|'CLOSED';openedAt:string;closesAt:string;rules:SimulationRules;entries:SimulationEntry[]};
export function createSimulationRound(id:string,rules:SimulationRules,now:number):SimulationRound{
 if(!/^SIM-[0-9a-f-]{36}$/i.test(id)||!Number.isFinite(now)||!Number.isSafeInteger(rules.durationMinutes)||rules.durationMinutes<1||rules.durationMinutes>60||!Number.isSafeInteger(rules.minEntryPoints)||!Number.isSafeInteger(rules.maxEntryPoints)||rules.minEntryPoints<1||rules.maxEntryPoints>1_000_000||rules.minEntryPoints>rules.maxEntryPoints||rules.maxRoundPoints!==null&&(!Number.isSafeInteger(rules.maxRoundPoints)||rules.maxRoundPoints<1))throw new RoundError('invalid_simulation_rules');
 if(!Number.isSafeInteger(rules.rateNumerator)||rules.rateNumerator<1||!Number.isSafeInteger(rules.rateDenominator)||rules.rateDenominator<1)throw new RoundError('invalid_settlement_rate');
 const configured=settlementRateFromAdminFee(rules.adminFeeRate);
 if(configured.numerator!==rules.rateNumerator||configured.denominator!==rules.rateDenominator)throw new RoundError('invalid_settlement_rate');
 return {id,status:'OPEN',openedAt:new Date(now).toISOString(),closesAt:new Date(now+rules.durationMinutes*60000).toISOString(),rules:{...rules},entries:[]};
}
export function addSimulationEntry(round:SimulationRound,entry:SimulationEntry,now:number):SimulationRound{
 if(round.status!=='OPEN'||now>=Date.parse(round.closesAt))throw new RoundError('round_closed',409);
 validateEntry({side:entry.side,demoPoints:entry.stake,idempotencyKey:entry.id});
 if(!entry.name.trim()||entry.name.length>50||!Number.isSafeInteger(entry.before)||entry.before<0)throw new RoundError('invalid_simulation_member');
 if(round.entries.some(item=>item.id===entry.id))throw new RoundError('idempotency_conflict',409);
 if(entry.stake<round.rules.minEntryPoints||entry.stake>round.rules.maxEntryPoints)throw new RoundError('entry_points_out_of_range',409);
 const total=round.entries.reduce((sum,item)=>sum+BigInt(item.stake),BigInt(0));
 if(round.rules.maxRoundPoints!==null&&total+BigInt(entry.stake)>BigInt(round.rules.maxRoundPoints))throw new RoundError('round_points_limit_exceeded',409);
 if(entry.before<entry.stake)throw new RoundError('insufficient_demo_points',409);
 return {...round,entries:[...round.entries,{...entry,name:entry.name.trim()}]};
}
export function closeSimulationRound(round:SimulationRound,now:number,advanceClock=false):SimulationRound{
 if(round.status==='CLOSED')return round;
 if(!advanceClock&&now<Date.parse(round.closesAt))throw new RoundError('round_not_expired',409);
 return {...round,status:'CLOSED',closesAt:advanceClock?new Date(now).toISOString():round.closesAt};
}
export function calculateSimulation(round:SimulationRound,number:string,confirmedForSimulation:boolean,ocrStatus:string){
 if(round.status!=='CLOSED')throw new RoundError('round_not_closed',409);
 if(!/^\d+(?:\.\d+)?$/.test(number))throw new RoundError('invalid_ocr_result',409);
 if(ocrStatus!=='READ'&&!confirmedForSimulation)throw new RoundError('simulation_confirmation_required',409);
 const lastDigit=number.at(-1)!,parity=Number(lastDigit)%2===0?'EVEN':'ODD';
 let totalBefore=0,totalStaked=0,totalAwards=0,winners=0;
 const members=round.entries.map(entry=>{
  const won=entry.side.toUpperCase()===parity,award=won?roundAwardPoints(entry.stake,round.rules.rateNumerator,round.rules.rateDenominator):0;
  const after=entry.before-entry.stake+award;
  if(!Number.isSafeInteger(after))throw new RoundError('simulation_balance_out_of_range',409);
  totalBefore+=entry.before;totalStaked+=entry.stake;totalAwards+=award;if(won)winners++;
  return {...entry,won,deducted:entry.stake,award,after};
 });
 const totalAfter=totalBefore-totalStaked+totalAwards;
 if(![totalBefore,totalStaked,totalAwards,totalAfter].every(Number.isSafeInteger))throw new RoundError('simulation_balance_out_of_range',409);
 return {roundId:round.id,number,lastDigit,parity,rateNumerator:round.rules.rateNumerator,rateDenominator:round.rules.rateDenominator,adminFeeRate:round.rules.adminFeeRate,memberCount:members.length,winners,losers:members.length-winners,totalBefore,totalStaked,totalAwards,totalAfter,systemNet:totalStaked-totalAwards,members,simulationOnly:true};
}

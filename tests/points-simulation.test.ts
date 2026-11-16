import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {settlementRateFromAdminFee} from '../lib/rounds/admin-fee';
import {roundAwardPoints} from '../lib/rounds/payout';
import {addSimulationEntry,calculateSimulation,closeSimulationRound,createSimulationRound} from '../lib/rounds/points-simulation';
const rate=settlementRateFromAdminFee('5'); // Configured fee fixture; production reads its current fee.
const rules={minEntryPoints:1,maxEntryPoints:1000000,maxRoundPoints:null,rateNumerator:rate.numerator,rateDenominator:rate.denominator,adminFeeRate:'5',durationMinutes:1};
const start=Date.parse('2026-11-16T00:00:00Z');
const entry=(name:string,side:'even'|'odd',stake:number,before=1000)=>({id:randomUUID(),name,side,stake,before});
function example(){let round=createSimulationRound(`SIM-${randomUUID()}`,rules,start);for(const [name,side,stake] of [['A','odd',100],['B','even',50],['C','odd',200],['D','even',100]] as const)round=addSimulationEntry(round,entry(name,side,stake),start+1);return closeSimulationRound(round,start+60000)}
test('odd OCR settles every synthetic member using the real payout function',()=>{
 const result=calculateSimulation(example(),'5.8343',false,'READ');
 assert.deepEqual([result.lastDigit,result.parity,result.winners,result.losers],['3','ODD',2,2]);
 assert.deepEqual(result.members.map(m=>[m.name,m.deducted,m.award,m.after]),[['A',100,roundAwardPoints(100,rate.numerator,rate.denominator),1095],['B',50,0,950],['C',200,roundAwardPoints(200,rate.numerator,rate.denominator),1190],['D',100,0,900]]);
 assert.deepEqual([result.totalBefore,result.totalStaked,result.totalAwards,result.totalAfter,result.systemNet],[4000,450,585,4135,-135]);
});
test('even OCR pays even selections and preserves trailing decimal zero',()=>{
 const result=calculateSimulation(example(),'0.00',false,'READ');assert.equal(result.parity,'EVEN');assert.equal(result.lastDigit,'0');
 assert.deepEqual(result.members.map(m=>m.award),[0,97,0,195]);assert.equal(result.totalAfter,3842);
});
test('wrong side loses its stake and receives no award',()=>{
 const result=calculateSimulation(example(),'2.47',false,'READ');assert.equal(result.members[1].after,950);assert.equal(result.members[1].award,0);
});
test('insufficient points and configured entry limits reject an entry',()=>{
 const round=createSimulationRound(`SIM-${randomUUID()}`,{...rules,minEntryPoints:10,maxEntryPoints:500,maxRoundPoints:100},start);
 assert.throws(()=>addSimulationEntry(round,entry('A','odd',101,200),start+1),/round_points_limit_exceeded/);
 assert.throws(()=>addSimulationEntry(round,entry('A','odd',5),start+1),/entry_points_out_of_range/);
 assert.throws(()=>addSimulationEntry(round,entry('A','odd',100,99),start+1),/insufficient_demo_points/);
});
test('repeated calculation never accumulates points or entries',()=>{
 const round=example(),first=calculateSimulation(round,'5.8343',false,'READ'),second=calculateSimulation(round,'5.8343',false,'READ');assert.deepEqual(first,second);assert.equal(round.entries.length,4);
 assert.throws(()=>addSimulationEntry(round,entry('E','odd',20),start+60001),/round_closed/);
});
test('unverified or unreadable OCR requires explicit simulation-only confirmation',()=>{
 const round=example();assert.throws(()=>calculateSimulation(round,'5.8343',false,'READ_UNVERIFIED'),/simulation_confirmation_required/);
 assert.throws(()=>calculateSimulation(round,'',true,'REVIEW_REQUIRED'),/invalid_ocr_result/);
 const result=calculateSimulation(round,'5.8343',true,'REVIEW_REQUIRED');assert.equal(result.simulationOnly,true);assert.equal(result.number,'5.8343');
});

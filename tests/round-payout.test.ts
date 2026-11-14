import test from 'node:test';
import assert from 'node:assert/strict';
import {settlementRateFromAdminFee} from '../lib/rounds/admin-fee';
import {roundAwardPoints} from '../lib/rounds/payout';

test('admin fee uses integer math and floors only the fractional point for each entry',()=>{
 const ten=settlementRateFromAdminFee('10');
 assert.equal(roundAwardPoints(100,ten.numerator,ten.denominator),190);
 const fractional=settlementRateFromAdminFee('1.25');
 assert.equal(roundAwardPoints(100,fractional.numerator,fractional.denominator),198);
 assert.equal(roundAwardPoints(1,fractional.numerator,fractional.denominator),1);
 assert.equal(roundAwardPoints(200,fractional.numerator,fractional.denominator),397);
 assert.throws(()=>roundAwardPoints(0,ten.numerator,ten.denominator));
});

import {RoundError} from './core';

/** Integer ratio for the total return, including the stake: 2 - feePercent/100. */
export function settlementRateFromAdminFee(value:string):{numerator:number;denominator:number}{
 if(!/^(?:0|[1-9]\d{0,2})(?:\.\d{1,4})?$/.test(value))throw new RoundError('invalid_admin_fee_rate',400);
 const [whole,fraction='']=value.split('.');
 const feeUnits=Number(whole)*10000+Number(fraction.padEnd(4,'0'));
 if(feeUnits>1000000)throw new RoundError('invalid_admin_fee_rate',400);
 return {numerator:2000000-feeUnits,denominator:1000000};
}

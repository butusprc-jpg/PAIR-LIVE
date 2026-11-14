import {RoundError} from './core';

/** Total return including stake. Fractions of a point are discarded per entry. */
export function roundAwardPoints(stake:number,numerator:number,denominator:number){
 if(!Number.isSafeInteger(stake)||stake<1||!Number.isSafeInteger(numerator)||numerator<1||!Number.isSafeInteger(denominator)||denominator<1)throw new RoundError('invalid_settlement_rate',409);
 const amount=BigInt(stake)*BigInt(numerator)/BigInt(denominator);
 if(amount<BigInt(1)||amount>BigInt(Number.MAX_SAFE_INTEGER))throw new RoundError('payout_out_of_range',409);
 return Number(amount);
}

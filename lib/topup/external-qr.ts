import {createHmac,timingSafeEqual} from 'node:crypto';
const ttlSeconds=180;
function mac(expires:number,secret:string){return createHmac('sha256',secret).update('pair-live-topup-qr-external-v1:'+expires).digest('hex')}
export function createExternalQrToken(secret:string,now=Math.floor(Date.now()/1000)){
 if(!secret)throw new Error('qr_link_secret_not_configured');
 const expires=now+ttlSeconds;
 return {expires,signature:mac(expires,secret)};
}
export function verifyExternalQrToken(expiresRaw:string|null,signature:string|null,secret:string,now=Math.floor(Date.now()/1000)){
 if(!secret||!expiresRaw||!signature||!/^\d{10}$/.test(expiresRaw)||!/^[a-f0-9]{64}$/.test(signature))return false;
 const expires=Number(expiresRaw);
 if(!Number.isSafeInteger(expires)||expires<=now||expires>now+ttlSeconds)return false;
 return timingSafeEqual(Buffer.from(signature,'hex'),Buffer.from(mac(expires,secret),'hex'));
}

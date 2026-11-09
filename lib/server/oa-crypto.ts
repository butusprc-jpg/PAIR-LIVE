import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';

function key(){const raw=process.env.OA_CREDENTIAL_ENCRYPTION_KEY;if(!raw)throw new Error('oa_key_not_configured');const bytes=Buffer.from(raw,'base64');if(bytes.length!==32)throw new Error('oa_key_invalid');return bytes}
export function encryptOaSecret(oaId:string,field:string,value:string){
 if(!value)throw new Error('oa_secret_missing');const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv);
 cipher.setAAD(Buffer.from(`${oaId}:${field}`));const data=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
 return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${data.toString('base64url')}`;
}
export function decryptOaSecret(oaId:string,field:string,encoded:string){
 const [version,nonce,tag,data,...rest]=encoded.split('.');if(version!=='v1'||!nonce||!tag||!data||rest.length)throw new Error('oa_ciphertext_invalid');
 const decipher=createDecipheriv('aes-256-gcm',key(),Buffer.from(nonce,'base64url'));
 decipher.setAAD(Buffer.from(`${oaId}:${field}`));decipher.setAuthTag(Buffer.from(tag,'base64url'));
 return Buffer.concat([decipher.update(Buffer.from(data,'base64url')),decipher.final()]).toString('utf8');
}

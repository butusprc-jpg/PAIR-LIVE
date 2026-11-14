import {DeleteObjectCommand,GetObjectCommand,PutObjectCommand,S3Client} from '@aws-sdk/client-s3';
import {mkdir,open,readFile,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {MAX_EVIDENCE_BYTES,validatePng} from './evidence';

const keyPattern=/^private\/ocr\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/([0-9]+)\/([0-9a-f]{64})\/(full|crop)\.png$/;
function digestFromKey(key:string){const match=keyPattern.exec(key);if(!match)throw new Error('invalid_candidate_image_key');return match[3]}
export function candidateImageKeys(oaId:string,roundId:string,originalSha256:string,cropSha256:string){
 const full=`private/ocr/${oaId}/${roundId}/${originalSha256}/full.png`,crop=`private/ocr/${oaId}/${roundId}/${cropSha256}/crop.png`;
 digestFromKey(full);digestFromKey(crop);return {full,crop};
}
export interface CandidateImageStorage{putImmutable(key:string,data:Buffer):Promise<void>;get(key:string):Promise<Buffer|null>;remove(key:string):Promise<void>}

export class LocalCandidateImageStorage implements CandidateImageStorage{
 constructor(private root:string){}
 private path(key:string){digestFromKey(key);return join(this.root,...key.split('/'))}
 async putImmutable(key:string,data:Buffer){if(validatePng(data)!==digestFromKey(key))throw new Error('candidate_image_hash_mismatch');const path=this.path(key);await mkdir(join(path,'..'),{recursive:true,mode:0o700});
  try{const file=await open(path,'wx',0o600);try{await file.writeFile(data)}finally{await file.close()}}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;const prior=await readFile(path);if(!prior.equals(data))throw new Error('candidate_image_collision')}
 }
 async get(key:string){try{const data=await readFile(this.path(key));if(validatePng(data)!==digestFromKey(key))throw new Error('candidate_image_integrity_failed');return data}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error}}
 async remove(key:string){try{await unlink(this.path(key))}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error}if(await this.get(key))throw new Error('candidate_image_delete_unconfirmed')}
}

export class S3CandidateImageStorage implements CandidateImageStorage{
 private client:S3Client;
 constructor(private config:{endpoint:string;region:string;bucket:string;accessKeyId:string;secretAccessKey:string}){
  if(!config.endpoint.startsWith('https://')||!config.bucket)throw new Error('candidate_storage_not_configured');
  this.client=new S3Client({endpoint:config.endpoint,region:config.region,forcePathStyle:true,credentials:{accessKeyId:config.accessKeyId,secretAccessKey:config.secretAccessKey}});
 }
 async putImmutable(key:string,data:Buffer){if(validatePng(data)!==digestFromKey(key))throw new Error('candidate_image_hash_mismatch');
  try{await this.client.send(new PutObjectCommand({Bucket:this.config.bucket,Key:key,Body:data,ContentType:'image/png',ContentLength:data.length,IfNoneMatch:'*',Metadata:{sha256:digestFromKey(key)}}))}catch(error){const name=(error as {name?:string}).name;if(name!=='PreconditionFailed'&&name!=='ConditionalRequestConflict')throw error;const existing=await this.get(key);if(!existing?.equals(data))throw new Error('candidate_image_collision')}
  if(!(await this.get(key))?.equals(data))throw new Error('candidate_image_write_unconfirmed');
 }
 async get(key:string){digestFromKey(key);try{const result=await this.client.send(new GetObjectCommand({Bucket:this.config.bucket,Key:key}));if(result.ContentLength&&result.ContentLength>MAX_EVIDENCE_BYTES)throw new Error('invalid_evidence_size');if(!result.Body)throw new Error('candidate_image_missing');const chunks:Buffer[]=[];let size=0;for await(const part of result.Body as AsyncIterable<Uint8Array>){const data=Buffer.from(part);size+=data.length;if(size>MAX_EVIDENCE_BYTES)throw new Error('invalid_evidence_size');chunks.push(data)}const image=Buffer.concat(chunks);if(validatePng(image)!==digestFromKey(key))throw new Error('candidate_image_integrity_failed');return image}catch(error){if(['NoSuchKey','NotFound'].includes((error as {name?:string}).name||''))return null;throw error}}
 async remove(key:string){digestFromKey(key);await this.client.send(new DeleteObjectCommand({Bucket:this.config.bucket,Key:key}));if(await this.get(key))throw new Error('candidate_image_delete_unconfirmed')}
}

export function configuredCandidateImageStorage():CandidateImageStorage|null{
 const endpoint=process.env.EVIDENCE_S3_ENDPOINT,region=process.env.EVIDENCE_S3_REGION,bucket=process.env.EVIDENCE_S3_BUCKET,accessKeyId=process.env.EVIDENCE_S3_ACCESS_KEY_ID,secretAccessKey=process.env.EVIDENCE_S3_SECRET_ACCESS_KEY;
 if(endpoint&&region&&bucket&&accessKeyId&&secretAccessKey)return new S3CandidateImageStorage({endpoint,region,bucket,accessKeyId,secretAccessKey});
 if(process.env.NODE_ENV!=='production'&&process.env.EVIDENCE_LOCAL_ROOT)return new LocalCandidateImageStorage(process.env.EVIDENCE_LOCAL_ROOT);
 return null;
}

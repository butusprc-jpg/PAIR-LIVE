import {createHash} from 'node:crypto';
import {mkdir,open,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import type {OcrReading,SourceType} from './core';
export const MAX_EVIDENCE_BYTES=5*1024*1024;
const pngSignature=Buffer.from([137,80,78,71,13,10,26,10]);
export function validatePng(data:Buffer){
 if(!Buffer.isBuffer(data)||data.length<45||data.length>MAX_EVIDENCE_BYTES)throw new Error('invalid_evidence_size');
 if(!data.subarray(0,8).equals(pngSignature))throw new Error('invalid_evidence_png');
 let offset=8,seenHeader=false,seenData=false,seenEnd=false;
 while(offset+12<=data.length){const length=data.readUInt32BE(offset),type=data.toString('ascii',offset+4,offset+8);if(length>data.length-offset-12)throw new Error('invalid_evidence_png');
  if(!seenHeader){if(type!=='IHDR'||length!==13)throw new Error('invalid_evidence_png');const width=data.readUInt32BE(offset+8),height=data.readUInt32BE(offset+12);if(width<1||height<1||width>8192||height>8192)throw new Error('invalid_evidence_png');seenHeader=true}
  if(type==='IDAT')seenData=true;
  offset+=length+12;
  if(type==='IEND'){if(length!==0||offset!==data.length)throw new Error('invalid_evidence_png');seenEnd=true;break}
 }
 if(!seenHeader||!seenData||!seenEnd)throw new Error('invalid_evidence_png');
 return createHash('sha256').update(data).digest('hex');
}
export type EvidenceRecord={roundId:string;frameId:string;source:SourceType;capturedAt:string;rawText:string;normalizedText:string;confidence:number;originalSha256:string;cropSha256:string;originalKey:string;cropKey:string};
export interface EvidenceStorage {putImmutable(key:string,data:Buffer):Promise<void>;get(key:string):Promise<Buffer|null>}
function validKey(key:string){if(!/^[a-f0-9]{64}\.png$/.test(key))throw new Error('invalid_evidence_key')}
export class LocalEvidenceStorage implements EvidenceStorage {
 constructor(private root:string){}
 async putImmutable(key:string,data:Buffer){validKey(key);if(`${validatePng(data)}.png`!==key)throw new Error('evidence_hash_mismatch');await mkdir(this.root,{recursive:true,mode:0o700});const path=join(this.root,key);
  try{const file=await open(path,'wx',0o600);try{await file.writeFile(data)}finally{await file.close()}}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;const existing=await readFile(path);if(!existing.equals(data))throw new Error('evidence_collision')}
 }
 async get(key:string){validKey(key);try{const data=await readFile(join(this.root,key));if(`${validatePng(data)}.png`!==key)throw new Error('evidence_integrity_failed');return data}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error}}
}
export async function storeEvidence(reading:OcrReading,storage:EvidenceStorage):Promise<EvidenceRecord>{
 if(!/^\d+$/.test(reading.frame.roundId)||!reading.frame.id||!Number.isFinite(Date.parse(reading.frame.capturedAt)))throw new Error('invalid_evidence_metadata');
 const originalSha256=validatePng(reading.frame.image),cropSha256=validatePng(reading.crop);const originalKey=`${originalSha256}.png`,cropKey=`${cropSha256}.png`;
 await storage.putImmutable(originalKey,reading.frame.image);if(cropKey!==originalKey)await storage.putImmutable(cropKey,reading.crop);
 return {roundId:reading.frame.roundId,frameId:reading.frame.id,source:reading.frame.source,capturedAt:reading.frame.capturedAt,rawText:reading.rawText,normalizedText:reading.normalizedText,confidence:reading.confidence,originalSha256,cropSha256,originalKey,cropKey};
}

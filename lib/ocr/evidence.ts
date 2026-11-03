import {createHash} from 'node:crypto';
import {mkdir,open} from 'node:fs/promises';
import {join} from 'node:path';
import type {OcrReading,SourceType} from './core';
export type EvidenceRecord={roundId:string;frameId:string;source:SourceType;capturedAt:string;rawText:string;normalizedText:string;confidence:number;originalSha256:string;cropSha256:string;originalKey:string;cropKey:string};
export interface EvidenceStorage {putImmutable(key:string,data:Buffer):Promise<void>}
export class LocalEvidenceStorage implements EvidenceStorage {constructor(private root:string){}async putImmutable(key:string,data:Buffer){if(!/^[a-f0-9]{64}\.png$/.test(key))throw new Error('invalid_evidence_key');await mkdir(this.root,{recursive:true});const file=await open(join(this.root,key),'wx',0o600);try{await file.writeFile(data)}finally{await file.close()}}}
export async function storeEvidence(reading:OcrReading,storage:EvidenceStorage):Promise<EvidenceRecord>{const originalSha256=createHash('sha256').update(reading.frame.image).digest('hex');const cropSha256=createHash('sha256').update(reading.crop).digest('hex');const originalKey=`${originalSha256}.png`,cropKey=`${cropSha256}.png`;await storage.putImmutable(originalKey,reading.frame.image);if(cropKey!==originalKey)await storage.putImmutable(cropKey,reading.crop);return {roundId:reading.frame.roundId,frameId:reading.frame.id,source:reading.frame.source,capturedAt:reading.frame.capturedAt,rawText:reading.rawText,normalizedText:reading.normalizedText,confidence:reading.confidence,originalSha256,cropSha256,originalKey,cropKey}}

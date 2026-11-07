import {validatePng} from '../../lib/ocr/evidence';
import type {EvidenceStorage} from '../../lib/ocr/evidence';
export class FakeEvidenceStorage implements EvidenceStorage {
 private objects=new Map<string,Buffer>();
 async putImmutable(key:string,data:Buffer){if(!/^[a-f0-9]{64}\.png$/.test(key))throw new Error('invalid_evidence_key');if(`${validatePng(data)}.png`!==key)throw new Error('evidence_hash_mismatch');const old=this.objects.get(key);if(old&&!old.equals(data))throw new Error('evidence_collision');this.objects.set(key,Buffer.from(data))}
 async get(key:string){if(!/^[a-f0-9]{64}\.png$/.test(key))throw new Error('invalid_evidence_key');const data=this.objects.get(key);if(!data)return null;if(`${validatePng(data)}.png`!==key)throw new Error('evidence_integrity_failed');return Buffer.from(data)}
}

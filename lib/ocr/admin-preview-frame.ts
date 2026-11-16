import {randomUUID} from 'node:crypto';
import type {Frame} from './core';

// Preview frames are private, short-lived, and never written to the database.
const ttlMs=5*60*1000,maxFrames=8;
type Entry={frame:Frame;adminId:string;cameraId:string;oaId:string;expiresAt:number};
const frames=new Map<string,Entry>();

export function saveAdminPreviewFrame(frame:Frame,adminId:string,cameraId:string,oaId:string,now=Date.now()){
 for(const [id,entry] of frames)if(entry.expiresAt<=now)frames.delete(id);
 while(frames.size>=maxFrames)frames.delete(frames.keys().next().value!);
 const id=randomUUID();frames.set(id,{frame,adminId,cameraId,oaId,expiresAt:now+ttlMs});return id;
}
export function getAdminPreviewFrame(id:string,adminId:string,cameraId:string,oaId:string,now=Date.now()){
 const entry=frames.get(id);
 if(!entry)return null;
 if(entry.expiresAt<=now){frames.delete(id);return null}
 return entry.adminId===adminId&&entry.cameraId===cameraId&&entry.oaId===oaId?entry.frame:null;
}

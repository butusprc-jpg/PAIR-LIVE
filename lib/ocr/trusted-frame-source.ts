import type {Frame,FrameSource,Roi} from './core';
/** Contract for an authenticated server-attested capture adapter (not configured). */
export interface TrustedFrameSource extends FrameSource {
 readonly type:'MOBILE_CAMERA';
 readonly transport:'SERVER_ATTESTED_CAPTURE';
 captureAfter(roundId:string,closedAt:string,roi:Roi):Promise<Frame>;
 health():Promise<'HEALTHY'|'OFFLINE'|'STALE'>;
}
/** Never use browser-uploaded images as trusted settlement evidence. */
export function requireTrustedFrameSource(source:FrameSource):asserts source is TrustedFrameSource{
 if(!('transport' in source)||source.transport!=='SERVER_ATTESTED_CAPTURE'||!('captureAfter' in source)||!('health' in source))throw new Error('trusted_frame_source_unavailable');
}

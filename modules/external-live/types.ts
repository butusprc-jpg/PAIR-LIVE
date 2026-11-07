export type LiveStatus='OFFLINE'|'READY'|'SHOWING'|'INTERMISSION';
export type LiveMode='MANUAL'|'AUTO';
export type LiveState={status:LiveStatus;mode:LiveMode;videoId:string|null;embedUrl:string|null;showSeconds:number;breakSeconds:number;startedAt:string|null;phaseEndsAt:string|null;serverNow:string;revision:number};
export class LiveError extends Error {constructor(public code:string,public status=400){super(code)}}

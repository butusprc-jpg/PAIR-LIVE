import type {Frame,Roi} from './core';

export type LiveSourceKind='VDO_NINJA'|'IP_CAMERA'|'RTSP_GATEWAY';
export type LiveCamera={cameraId:string;oaId:string;siteId:string;sourceKind:LiveSourceKind;streamId:string|null;displayEnabled:boolean};
export type NormalizedRoi={x:number;y:number;width:number;height:number};
export interface LiveFrameSource{
 readonly kind:LiveSourceKind;
 open(camera:LiveCamera):Promise<void>;
 capture():Promise<Frame>;
 close():Promise<void>;
}
export type LiveFrameAdapterFactory=(camera:LiveCamera)=>LiveFrameSource;

/** Camera-independent handoff to the OCR engine. This does not verify a round. */
export async function captureLiveFrame(source:LiveFrameSource,camera:LiveCamera,roi:NormalizedRoi,now=()=>Date.now()){
 if(source.kind!==camera.sourceKind||!camera.displayEnabled||!validNormalizedRoi(roi))throw new Error('live_capture_configuration_invalid');
 await source.open(camera);
 try{
  const frame=await source.capture();const age=now()-Date.parse(frame.capturedAt);
  if(!frame.healthy||!Number.isFinite(age)||age<0||age>4000||frame.image.length<24)throw new Error('live_frame_stale_or_offline');
  return {cameraId:camera.cameraId,oaId:camera.oaId,frame,roi:roiForFrame(roi,frame)};
 }finally{await source.close()}
}

export function chooseLiveFrameSource(camera:LiveCamera,expectedOaId:string,factories:Partial<Record<LiveSourceKind,LiveFrameAdapterFactory>>):LiveFrameSource{
 if(camera.oaId!==expectedOaId||!camera.displayEnabled)throw new Error('live_camera_oa_or_state_mismatch');
 const factory=factories[camera.sourceKind];
 if(!factory)throw new Error('live_camera_adapter_unavailable');
 const source=factory(camera);
 if(source.kind!==camera.sourceKind)throw new Error('live_camera_adapter_mismatch');
 return source;
}
export function validNormalizedRoi(value:unknown):value is NormalizedRoi{
 if(!value||typeof value!=='object')return false;
 const v=value as Record<string,unknown>;
 return ['x','y','width','height'].every(k=>Number.isInteger(v[k])&&Number(v[k])>=0&&Number(v[k])<=10000)
  &&Number(v.width)>0&&Number(v.height)>0&&Number(v.x)+Number(v.width)<=10000&&Number(v.y)+Number(v.height)<=10000;
}
export function roiForFrame(roi:NormalizedRoi,frame:Pick<Frame,'width'|'height'>):Roi{
 if(!validNormalizedRoi(roi)||!Number.isSafeInteger(frame.width)||!Number.isSafeInteger(frame.height)||frame.width<1||frame.height<1)throw new Error('invalid_roi');
 const x=Math.floor(roi.x*frame.width/10000),y=Math.floor(roi.y*frame.height/10000);
 const right=Math.ceil((roi.x+roi.width)*frame.width/10000),bottom=Math.ceil((roi.y+roi.height)*frame.height/10000);
 return {x,y,width:Math.min(frame.width,right)-x,height:Math.min(frame.height,bottom)-y};
}

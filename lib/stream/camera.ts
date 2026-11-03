export type Facing='environment'|'user';
export async function requestCamera(media:Pick<MediaDevices,'getUserMedia'>,facing:Facing){
 const preferred={audio:false,video:{facingMode:{ideal:facing},width:{ideal:1280},height:{ideal:720},frameRate:{ideal:15,max:15}}} as MediaStreamConstraints;
 try{return await media.getUserMedia(preferred)}catch(error){if(!(error instanceof DOMException)||!['OverconstrainedError','NotFoundError'].includes(error.name))throw error;return media.getUserMedia({audio:false,video:{facingMode:{ideal:facing},width:{ideal:640},height:{ideal:360},frameRate:{ideal:15}}})}
}
export function stopCamera(stream:MediaStream|null){stream?.getTracks().forEach(track=>track.stop())}
export function cameraError(error:unknown){if(error instanceof DOMException){if(['NotAllowedError','PermissionDeniedError'].includes(error.name))return 'ไม่ได้รับอนุญาตให้ใช้กล้อง กรุณาเปิดสิทธิ์กล้องในเบราว์เซอร์';if(error.name==='NotFoundError')return 'ไม่พบกล้องบนอุปกรณ์นี้'}return 'เปิดกล้องไม่สำเร็จ กรุณาตรวจอุปกรณ์และ HTTPS'}

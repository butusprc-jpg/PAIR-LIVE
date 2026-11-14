import type {Pool} from 'pg';
import type {CandidateImageStorage} from './candidate-image-storage';
import {validatePng} from './evidence';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type ImageRow={id:string;round_id:string;oa_id:string;camera_id:string;captured_at:Date;full_text:string;last_digit:string;parity:string;confidence:string;original_sha256:string;crop_sha256:string;original_object_key:string;crop_object_key:string;status:string;created_at:Date};
function publicImage(row:ImageRow){return {id:row.id,roundId:String(row.round_id),capturedAt:new Date(row.captured_at).toISOString(),number:row.full_text,lastDigit:row.last_digit,parity:row.parity,confidence:Number(row.confidence),status:row.status,originalSha256:row.original_sha256.trim(),cropSha256:row.crop_sha256.trim()}}
export async function listCandidateImages(pool:Pool,oaId:string,roundId?:string){
 if(!uuid.test(oaId)||roundId!==undefined&&!/^\d{1,18}$/.test(roundId))throw new Error('invalid_evidence_filter');
 const result=await pool.query<ImageRow>(`SELECT * FROM round_ocr_candidate_images WHERE oa_id=$1 AND ($2::bigint IS NULL OR round_id=$2::bigint) ORDER BY round_id DESC,captured_at DESC LIMIT 50`,[oaId,roundId??null]);
 return result.rows.map(publicImage);
}
export async function readCandidateImage(pool:Pool,storage:CandidateImageStorage,oaId:string,id:string,kind:'full'|'crop'){
 if(!uuid.test(oaId)||!uuid.test(id)||!['full','crop'].includes(kind))throw new Error('invalid_evidence_id');
 const row=(await pool.query<ImageRow>('SELECT * FROM round_ocr_candidate_images WHERE id=$1 AND oa_id=$2 AND status=$3',[id,oaId,'AVAILABLE'])).rows[0];
 if(!row)return null;
 const key=kind==='full'?row.original_object_key:row.crop_object_key,expected=(kind==='full'?row.original_sha256:row.crop_sha256).trim();
 const image=await storage.get(key);if(!image||validatePng(image)!==expected)throw new Error('candidate_image_integrity_failed');return image;
}
type DeleteResult={id:string;status:'DELETED'|'DELETING';replayed:boolean};
export async function deleteCandidateImage(pool:Pool,storage:CandidateImageStorage,oaId:string,adminId:string,id:string,now=()=>Date.now()):Promise<DeleteResult>{
 if(!uuid.test(oaId)||!uuid.test(adminId)||!uuid.test(id))throw new Error('invalid_evidence_id');
 const client=await pool.connect();let row:(ImageRow & {round_status:string;delete_requested_at:Date|null})|undefined;
 try{
  await client.query('BEGIN');
  row=(await client.query<ImageRow & {round_status:string;delete_requested_at:Date|null}>(`SELECT i.*,r.status AS round_status,i.delete_requested_at FROM round_ocr_candidate_images i JOIN rounds r ON r.id=i.round_id WHERE i.id=$1 AND i.oa_id=$2 FOR UPDATE OF i,r`,[id,oaId])).rows[0];
  if(!row)throw new Error('candidate_image_not_found');
  if(row.status==='DELETED'){await client.query('COMMIT');return {id,status:'DELETED',replayed:true}}
  if(!['SETTLED','CANCELLED'].includes(row.round_status))throw new Error('candidate_image_still_required');
  if(row.status==='DELETING'&&row.delete_requested_at&&now()-new Date(row.delete_requested_at).getTime()<30_000){await client.query('COMMIT');return {id,status:'DELETING',replayed:true}}
  if(row.status==='AVAILABLE'){
   await client.query("UPDATE round_ocr_candidate_images SET status='DELETING',delete_requested_by=$2,delete_requested_at=clock_timestamp() WHERE id=$1",[id,adminId]);
   await client.query("INSERT INTO round_ocr_image_delete_audit(image_id,round_id,oa_id,actor,action) VALUES($1,$2,$3,$4,'DELETE_REQUESTED')",[id,row.round_id,oaId,adminId]);
  }
  await client.query('COMMIT');
 }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
 try{
  await storage.remove(row!.original_object_key);
  await storage.remove(row!.crop_object_key);
  if(await storage.get(row!.original_object_key)||await storage.get(row!.crop_object_key))throw new Error('candidate_image_delete_unconfirmed');
 }catch{await pool.query("INSERT INTO round_ocr_image_delete_audit(image_id,round_id,oa_id,actor,action,detail) VALUES($1,$2,$3,$4,'DELETE_FAILED','storage_delete_failed')",[id,row!.round_id,oaId,adminId]).catch(()=>{});throw new Error('candidate_image_delete_failed')}
 const finalClient=await pool.connect();try{
  await finalClient.query('BEGIN');const current=(await finalClient.query<{status:string}>('SELECT status FROM round_ocr_candidate_images WHERE id=$1 AND oa_id=$2 FOR UPDATE',[id,oaId])).rows[0];
  if(current?.status==='DELETED'){await finalClient.query('COMMIT');return {id,status:'DELETED',replayed:true}}
  if(current?.status!=='DELETING')throw new Error('candidate_image_delete_state_changed');
  await finalClient.query("UPDATE round_ocr_candidate_images SET status='DELETED',deleted_at=clock_timestamp() WHERE id=$1 AND oa_id=$2",[id,oaId]);
  await finalClient.query("INSERT INTO round_ocr_image_delete_audit(image_id,round_id,oa_id,actor,action) VALUES($1,$2,$3,$4,'DELETE_COMPLETED')",[id,row!.round_id,oaId,adminId]);
  await finalClient.query('COMMIT');return {id,status:'DELETED',replayed:false};
 }catch(error){await finalClient.query('ROLLBACK');throw error}finally{finalClient.release()}
}
export async function deleteCandidateImages(pool:Pool,storage:CandidateImageStorage,oaId:string,adminId:string,ids:string[],now=()=>Date.now()){
 if(!Array.isArray(ids)||ids.length<1||ids.length>20||new Set(ids).size!==ids.length||ids.some(id=>!uuid.test(id)))throw new Error('invalid_evidence_ids');
 const results:DeleteResult[]=[];for(const id of ids)results.push(await deleteCandidateImage(pool,storage,oaId,adminId,id,now));return results;
}

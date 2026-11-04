import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {GetObjectCommand,HeadObjectCommand,PutObjectCommand} from '@aws-sdk/client-s3';
import type {Pool} from 'pg';
import {imageType,MAX_QR_BYTES,storage} from './qr';
import {TopupError,uuid} from './store';

export async function validateSlip(data:Buffer){
 const type=imageType(data);
 try {
  const img=sharp(data,{limitInputPixels:16000000,animated:false});
  const meta=await img.metadata();
  if(!meta.width||!meta.height||meta.width>4096||meta.height>4096||(meta.pages||1)!==1)throw new Error('bad_dimensions');
  await img.raw().toBuffer();
 } catch {throw new TopupError('invalid_slip_image')}
 return {type,sha:createHash('sha256').update(data).digest('hex')};
}
export async function putSlip(memberId:string,key:string,data:Buffer){
 if(!uuid(memberId)||!uuid(key))throw new TopupError('invalid_idempotency_key');
 const {type,sha}=await validateSlip(data);
 const objectKey='topup-slips/'+memberId+'/'+key;
 const {bucket,client}=storage();
 try {
  await client.send(new PutObjectCommand({Bucket:bucket,Key:objectKey,Body:data,ContentType:type,Metadata:{sha256:sha},IfNoneMatch:'*'}));
 } catch(error){
  // A retry can reuse an already uploaded object ONLY if the hash matches.
  if((error as {name?:string}).name!=='PreconditionFailed')throw error;
  const existing=await client.send(new HeadObjectCommand({Bucket:bucket,Key:objectKey}));
  if(existing.Metadata?.sha256!==sha||existing.ContentType!==type||existing.ContentLength!==data.length)throw new TopupError('idempotency_conflict',409);
 }
 return {objectKey,type,sha};
}
export async function getSlip(pool:Pool,id:string){
 if(!uuid(id))throw new TopupError('invalid_request_id');
 const r=await pool.query('SELECT slip_object_key,slip_content_type,slip_sha256 FROM member_topup_requests WHERE id=$1',[id]);
 const row=r.rows[0];
 if(!row?.slip_object_key)throw new TopupError('slip_not_found',404);
 const {bucket,client}=storage();
 const object=await client.send(new GetObjectCommand({Bucket:bucket,Key:row.slip_object_key}));
 if((object.ContentLength||0)>MAX_QR_BYTES||!object.Body)throw new TopupError('slip_missing',503);
 const chunks:Buffer[]=[];let size=0;
 for await(const chunk of object.Body as AsyncIterable<Uint8Array>){size+=chunk.length;if(size>MAX_QR_BYTES)throw new TopupError('invalid_image_size');chunks.push(Buffer.from(chunk))}
 const data=Buffer.concat(chunks);
 if(imageType(data)!==row.slip_content_type||createHash('sha256').update(data).digest('hex')!==row.slip_sha256)throw new TopupError('slip_integrity_failed',503);
 return {data,type:row.slip_content_type as string};
}

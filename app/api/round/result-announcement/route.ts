import {NextResponse} from 'next/server';
import {currentMember} from '../../../../lib/server/auth-http';
import {database} from '../../../../lib/server/db';
import {readResultAnnouncement} from '../../../../lib/rounds/result-announcement';
export const runtime='nodejs';
export async function GET(){
 try{
  if(!await currentMember())return NextResponse.json({error:'not_authenticated'},{status:401,headers:{'Cache-Control':'no-store'}});
  return NextResponse.json(await readResultAnnouncement(database()),{headers:{'Cache-Control':'private, no-store'}});
 }catch{return NextResponse.json({error:'result_unavailable'},{status:503,headers:{'Cache-Control':'no-store'}})}
}

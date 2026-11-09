import {NextResponse} from 'next/server';
import {database} from '../../../../lib/server/db';
import {resolveLoginOa} from '../../../../lib/owner/credential-store';
export const runtime='nodejs';
export async function GET(request:Request){
 const key=new URL(request.url).searchParams.get('oa');
 if(key!==null){
  try{const oa=await resolveLoginOa(database(),key);if(!oa)return NextResponse.json({lineConfigured:false,wechatConfigured:false},{status:404,headers:{'Cache-Control':'no-store'}});
   return NextResponse.json({lineConfigured:true,wechatConfigured:false,liffId:oa.liffId,oaKey:key},{headers:{'Cache-Control':'no-store'}})}
  catch{return NextResponse.json({lineConfigured:false,wechatConfigured:false},{status:503,headers:{'Cache-Control':'no-store'}})}
 }
 return NextResponse.json({lineConfigured:Boolean(process.env.NEXT_PUBLIC_LINE_LIFF_ID&&process.env.LINE_LOGIN_CHANNEL_ID),wechatConfigured:Boolean(process.env.WECHAT_APP_ID&&process.env.WECHAT_APP_SECRET&&process.env.WECHAT_REDIRECT_URI)},{headers:{'Cache-Control':'no-store'}})
}

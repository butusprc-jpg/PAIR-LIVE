import {randomBytes} from 'node:crypto';
import {NextResponse} from 'next/server';
import {wechatConfigured} from '../../../../../lib/server/wechat';
export const runtime='nodejs';
export async function GET(request:Request){
 if(!wechatConfigured())return NextResponse.json({ok:false,error:'wechat_not_configured'},{status:503});
 const target=new URL(request.url).searchParams.get('next')||'/';
 const next=target.startsWith('/')&&!target.startsWith('//')?target:'/';
 const state=randomBytes(24).toString('base64url');
 const url=new URL('https://open.weixin.qq.com/connect/oauth2/authorize');url.search=new URLSearchParams({appid:process.env.WECHAT_APP_ID!,redirect_uri:process.env.WECHAT_REDIRECT_URI!,response_type:'code',scope:'snsapi_userinfo',state}).toString();url.hash='wechat_redirect';
 const response=NextResponse.redirect(url);response.cookies.set('pair_wechat_state',`${state}:${Buffer.from(next).toString('base64url')}`,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:600});return response;
}

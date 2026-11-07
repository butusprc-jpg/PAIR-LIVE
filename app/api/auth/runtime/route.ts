import {NextResponse} from 'next/server';
export async function GET(){return NextResponse.json({lineConfigured:Boolean(process.env.NEXT_PUBLIC_LINE_LIFF_ID&&process.env.LINE_LOGIN_CHANNEL_ID),wechatConfigured:Boolean(process.env.WECHAT_APP_ID&&process.env.WECHAT_APP_SECRET&&process.env.WECHAT_REDIRECT_URI)},{headers:{'Cache-Control':'no-store'}})}

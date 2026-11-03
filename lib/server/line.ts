import 'server-only';
import {verifyLineAccessToken} from '../auth-core';
export async function verifyLineMember(accessToken:string){return verifyLineAccessToken(accessToken,process.env.LINE_CHANNEL_ID?.trim()||'')}

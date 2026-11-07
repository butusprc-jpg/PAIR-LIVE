import {emailLogin} from '../../../../lib/owner/email-auth';
import {ownerFailure} from '../../../../lib/owner/auth';
export const runtime='nodejs';
export async function POST(request:Request){try{return await emailLogin(request)}catch(e){return ownerFailure(e)}}

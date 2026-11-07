import {ownerAccess,ownerFailure,ownerLogin} from '../../../../lib/owner/auth';
export const runtime='nodejs';
export async function GET(request:Request){try{await ownerAccess(request);return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}})}catch(error){return ownerFailure(error)}}
export async function POST(request:Request){try{return await ownerLogin(request)}catch(error){return ownerFailure(error)}}

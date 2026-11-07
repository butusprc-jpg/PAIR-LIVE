import {ownerChallenge,ownerFailure} from '../../../../lib/owner/auth';
export const runtime='nodejs';
export async function POST(request:Request){try{return await ownerChallenge(request)}catch(error){return ownerFailure(error)}}

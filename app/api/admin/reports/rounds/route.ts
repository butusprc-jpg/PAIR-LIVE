import {adminAccess,adminDenied} from '../../../../../lib/server/admin-auth';
import {database} from '../../../../../lib/server/db';
import {readRoundParticipationReport,roundReportRoles} from '../../../../../lib/admin-reports';
export const runtime='nodejs';
export async function GET(request:Request){try{const access=await adminAccess(request,roundReportRoles);if(!access.ok)return adminDenied(access.error);return Response.json(await readRoundParticipationReport(database()),{headers:{'Cache-Control':'private, no-store'}})}catch{return Response.json({error:'report_unavailable'},{status:503})}}

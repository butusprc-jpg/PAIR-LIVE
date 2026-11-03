import {adminAccess,adminDenied} from '../../../../../lib/server/admin-auth';
import {database} from '../../../../../lib/server/db';
import {createPostgresReportReader,createReportService} from '../../../../../modules/report-notification';
export const runtime='nodejs';
export async function GET(request:Request){try{
 const access=await adminAccess(request,['admin','operator','viewer']);if(!access.ok)return adminDenied(access.error);
 const url=new URL(request.url),date=url.searchParams.get('date')||'',format=url.searchParams.get('format');const reports=createReportService(createPostgresReportReader(database()));
 if(format==='csv'){const result=await reports.exportDailyCsv(date);if(!result.ok)return Response.json({error:result.error},{status:result.error==='INVALID_DATE'?400:503});return new Response(result.value,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="pair-live-report.csv"','Cache-Control':'private, no-store'}})}
 const result=await reports.getDailyReport(date);if(!result.ok)return Response.json({error:result.error},{status:result.error==='INVALID_DATE'?400:503});return Response.json(result.value,{headers:{'Cache-Control':'private, no-store'}})
 }catch{return Response.json({error:'report_unavailable'},{status:503})}}

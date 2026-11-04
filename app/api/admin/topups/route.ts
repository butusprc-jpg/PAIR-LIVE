import {adminAccess} from '../../../../lib/server/admin-auth';
import {database} from '../../../../lib/server/db';
import {decideTopup,listTopups,TopupError,uuid} from '../../../../lib/topup/store';
import {historyFilter} from '../../../../lib/topup/export';
import {noStore,topupFailure} from '../../../../lib/topup/http';
import {dispatchApprovedMemberLine,queueApprovedMemberLine,requireMemberNotificationSchema} from '../../../../lib/topup/member-line-notify';
export const runtime='nodejs';
export async function GET(request:Request){try{const a=await adminAccess(request,['admin']);if(!a.ok)return Response.json({error:'forbidden'},{status:403,headers:noStore});const q=new URL(request.url).searchParams;const f=historyFilter(q);return Response.json({requests:await listTopups(database(),null,q.get('search')||'',q.get('status')||'',f.from,f.to)},{headers:noStore})}catch(e){return topupFailure(e)}}
export async function POST(request:Request){try{const a=await adminAccess(request,['admin'],true);if(!a.ok)return Response.json({error:'forbidden'},{status:403,headers:noStore});const b=await request.json();if(b.action==='APPROVED'&&uuid(b.id)){const row=(await listTopups(database(),null,b.id)).find(r=>r.id===b.id);if(row&&!row.has_slip&&b.evidenceReviewed!==true)throw new TopupError('slip_review_required',409);await requireMemberNotificationSchema(database())}const decided=await decideTopup(database(),a.value.admin.id,b.id,b.action,b.note??'');if(decided.status==='APPROVED'){await queueApprovedMemberLine(database(),decided);try{await dispatchApprovedMemberLine(database())}catch{/* Durable queue remains retryable. */}}return Response.json({request:decided},{headers:noStore})}catch(e){return topupFailure(e)}}

import {adminAccess} from '../../../../../lib/server/admin-auth';
import {database} from '../../../../../lib/server/db';
import {historyFilter,historySummary} from '../../../../../lib/topup/export';
import {topupFailure} from '../../../../../lib/topup/http';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:Request){try{const a=await adminAccess(request,['admin']);if(!a.ok)return new Response(null,{status:403});return Response.json(await historySummary(database(),historyFilter(new URL(request.url).searchParams)),{headers:{'Cache-Control':'private, no-store'}})}catch(e){return topupFailure(e)}}

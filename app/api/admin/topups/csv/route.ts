import {adminAccess} from '../../../../../lib/server/admin-auth';
import {database} from '../../../../../lib/server/db';
import {historyCsv,historyFilter} from '../../../../../lib/topup/export';
import {topupFailure} from '../../../../../lib/topup/http';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:Request){try{const a=await adminAccess(request,['admin']);if(!a.ok)return new Response(null,{status:403});const filter=historyFilter(new URL(request.url).searchParams);return new Response(historyCsv(database(),filter),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="pair-live-topups.csv"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}})}catch(e){return topupFailure(e)}}

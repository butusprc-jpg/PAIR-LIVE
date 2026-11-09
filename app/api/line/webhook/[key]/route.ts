import {database} from '../../../../../lib/server/db';
import {handleScopedWebhook} from '../../../../../lib/line/scoped-webhook';
export const runtime='nodejs';
export async function POST(request:Request,context:{params:Promise<{key:string}>}){
 const {key}=await context.params;return handleScopedWebhook(database(),key,request);
}

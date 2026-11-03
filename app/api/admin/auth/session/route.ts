import {configuredAdminAuth,adminDenied} from '../../../../../lib/server/admin-auth';
export const runtime='nodejs';
export async function GET(request:Request){try{const auth=configuredAdminAuth();return auth?auth.handleAdminSessionCheck(request):adminDenied('admin_not_configured')}catch{return adminDenied('service_unavailable')}}

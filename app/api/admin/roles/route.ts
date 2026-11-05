import {adminAccess,adminDenied} from '../../../../lib/server/admin-auth';
import {database} from '../../../../lib/server/db';
import {AdminRoleError,addAdminRole,eligibleLineMembers,listAdminRoles,updateAdminRole,validRole} from '../../../../lib/admin-roles/store';
export const runtime='nodejs';
const headers={'Cache-Control':'private, no-store'};
function failure(error:unknown){return error instanceof AdminRoleError?Response.json({error:error.code},{status:error.status,headers}):Response.json({error:'admin_roles_unavailable'},{status:503,headers})}
export async function GET(request:Request){
 try{const access=await adminAccess(request,['admin']);if(!access.ok)return adminDenied(access.error);
  const search=new URL(request.url).searchParams.get('search');
  if(search!==null)return Response.json({candidates:await eligibleLineMembers(database(),process.env.LINE_LOGIN_CHANNEL_ID||'',search)},{headers});
  return Response.json(await listAdminRoles(database()),{headers});
 }catch(error){return failure(error)}
}
export async function POST(request:Request){
 try{const access=await adminAccess(request,['admin'],true);if(!access.ok)return adminDenied(access.error);
  const body=await request.json();
  if(body.action==='add'&&validRole(body.role))return Response.json(await addAdminRole(database(),access.value.admin.id,body.memberIdentityId,body.role,process.env.LINE_LOGIN_CHANNEL_ID||''),{headers});
  if(body.action==='update')return Response.json(await updateAdminRole(database(),access.value.admin.id,body.targetId,{role:body.role,status:body.status}),{headers});
  return Response.json({error:'invalid_request'},{status:400,headers});
 }catch(error){return failure(error)}
}

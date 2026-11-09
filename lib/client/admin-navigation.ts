/** The server session endpoint is the only authority for showing admin navigation. */
export async function canOpenAdmin(fetcher:typeof fetch=fetch):Promise<boolean>{
 try{
  const response=await fetcher('/api/admin/auth/session',{credentials:'same-origin',cache:'no-store'});
  if(!response.ok)return false;
  const data=await response.json();
  return data?.ok===true&&data.session?.admin?.role==='admin';
 }catch{return false}
}

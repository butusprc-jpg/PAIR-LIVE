export type AdminNavigationStatus='allowed'|'unauthenticated'|'forbidden'|'unavailable';

/** Navigation mirrors dashboard access; actions still check their exact role on the server. */
export async function adminNavigationStatus(fetcher:typeof fetch=fetch):Promise<AdminNavigationStatus>{
 try{
  const response=await fetcher('/api/admin/auth/session',{credentials:'same-origin',cache:'no-store'});
  if(response.status===401)return 'unauthenticated';
  if(response.status===403)return 'forbidden';
  if(!response.ok)return 'unavailable';
  const data=await response.json();
  return data?.ok===true&&['admin','operator','viewer'].includes(data.session?.admin?.role)?'allowed':'unavailable';
 }catch{return 'unavailable'}
}
export async function canOpenAdmin(fetcher:typeof fetch=fetch):Promise<boolean>{
 return await adminNavigationStatus(fetcher)==='allowed';
}

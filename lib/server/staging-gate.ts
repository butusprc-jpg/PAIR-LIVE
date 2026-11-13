/** No financial, authentication, or messaging API is callable in synthetic staging. */
export function stagingApiBlocked(pathname:string,env:Record<string,string|undefined>){
 return env.RAILWAY_STAGING_NO_LINE==='true'&&pathname.startsWith('/api/')&&
  pathname!=='/api/health/ready'&&pathname!=='/api/health/db-target';
}

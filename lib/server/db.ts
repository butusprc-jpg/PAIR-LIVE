import {Pool} from 'pg';
import {assertRailwayStagingTarget} from './staging-target';
let pool:Pool|undefined;
export function databaseConnectionOptions(raw:string){
 const url=new URL(raw);
 if(!['postgres:','postgresql:'].includes(url.protocol))throw new Error('database_url_invalid');
 const host=url.hostname.toLowerCase();
 const privateRailway=host.endsWith('.railway.internal');
 const local=['127.0.0.1','localhost','::1'].includes(host);
 // pg parses sslmode from connectionString after the explicit ssl option.
 // Remove it so URL parameters cannot silently weaken public TLS validation.
 url.searchParams.delete('sslmode');
 url.searchParams.delete('sslcert');
 url.searchParams.delete('sslkey');
 url.searchParams.delete('sslrootcert');
 return {connectionString:url.toString(),ssl:local||privateRailway?false:{rejectUnauthorized:true}};
}
export function database(){
 if(!process.env.DATABASE_URL)throw new Error('database_not_configured');
 if(process.env.RAILWAY_STAGING_NO_LINE==='true')assertRailwayStagingTarget(process.env);
 return pool??=new Pool({...databaseConnectionOptions(process.env.DATABASE_URL),max:5,connectionTimeoutMillis:5000,idleTimeoutMillis:30000});
}

import {Pool} from 'pg';
import {assertRailwayStagingTarget} from './staging-target';
let pool:Pool|undefined;
export function database(){
 if(!process.env.DATABASE_URL)throw new Error('database_not_configured');
 const staging=process.env.RAILWAY_STAGING_NO_LINE==='true';
 if(staging)assertRailwayStagingTarget(process.env);
 const url=new URL(process.env.DATABASE_URL);const local=['127.0.0.1','localhost','::1'].includes(url.hostname);
 return pool??=new Pool({connectionString:process.env.DATABASE_URL,ssl:local?false:{rejectUnauthorized:!staging},max:5,connectionTimeoutMillis:5000,idleTimeoutMillis:30000});
}

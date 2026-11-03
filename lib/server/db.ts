import {Pool} from 'pg';
let pool:Pool|undefined;
export function database(){
 if(!process.env.DATABASE_URL)throw new Error('database_not_configured');
 const url=new URL(process.env.DATABASE_URL);const local=['127.0.0.1','localhost','::1'].includes(url.hostname);return pool??=new Pool({connectionString:process.env.DATABASE_URL,ssl:local?false:{rejectUnauthorized:true},max:5});
}

import 'server-only';
import {Pool} from 'pg';
let pool:Pool|undefined;
export function database(){
 if(!process.env.DATABASE_URL)throw new Error('database_not_configured');
 return pool??=new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:true},max:5});
}

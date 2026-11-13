import type {Pool} from 'pg';
import {singleOaReady} from './single-oa';

export async function readinessStatus(db:Pick<Pool,'query'>):Promise<'ready'|'database_unavailable'|'oa_binding_unavailable'>{
 try {await db.query('SELECT 1')} catch {return 'database_unavailable'}
 if(process.env.RAILWAY_STAGING_NO_LINE==='true'||process.env.RAILWAY_SINGLE_OA_MODE!=='true')return 'ready';
 try {return await singleOaReady(db)?'ready':'oa_binding_unavailable'} catch {return 'oa_binding_unavailable'}
}
export async function readiness(db:Pick<Pool,'query'>){return await readinessStatus(db)==='ready'}

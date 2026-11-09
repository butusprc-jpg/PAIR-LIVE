import type {Pool} from 'pg';
import {singleOaReady} from './single-oa';

export async function readiness(db:Pick<Pool,'query'>){
 try {await db.query('SELECT 1');return process.env.RAILWAY_SINGLE_OA_MODE==='true'?await singleOaReady(db):true} catch {return false}
}

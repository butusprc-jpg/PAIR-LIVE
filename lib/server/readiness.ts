import type {Pool} from 'pg';

export async function readiness(db:Pick<Pool,'query'>){
 try {await db.query('SELECT 1');return true} catch {return false}
}

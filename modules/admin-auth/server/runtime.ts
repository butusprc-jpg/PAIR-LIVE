import {randomBytes, createHash, timingSafeEqual} from 'node:crypto';
/** Node-only imports reject browser/Edge bundles; guard also blocks browser execution. */
export function assertServerRuntime():void {
 if(typeof window !== 'undefined' || typeof process === 'undefined' || !process.versions?.node) throw new Error('admin_auth_server_runtime_required');
}
export function randomToken():string {assertServerRuntime();return randomBytes(32).toString('base64url')}
export function hashToken(token:string):string {assertServerRuntime();return createHash('sha256').update('PAIR-LIVE:admin-auth:v1:').update(token).digest('hex')}
export function validToken(token:unknown):token is string {assertServerRuntime();return typeof token==='string'&&/^[A-Za-z0-9_-]{43}$/.test(token)}
export function equalToken(a:string,b:string):boolean {assertServerRuntime();return validToken(a)&&validToken(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b))}
export function cookie(request:Request,name:string):string|null {
 assertServerRuntime();const matches=(request.headers.get('cookie')||'').split(';').map(s=>s.trim()).filter(s=>s.startsWith(name+'='));
 if(matches.length!==1)return null;const value=matches[0].slice(name.length+1);return validToken(value)?value:null;
}

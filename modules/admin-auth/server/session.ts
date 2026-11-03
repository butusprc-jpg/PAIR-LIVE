import type {AdminProfile,AdminIdentity,AdminRole} from '../types';
import {assertServerRuntime} from './runtime';
export const ADMIN_COOKIE='pair_admin_session';
export const CSRF_COOKIE='pair_admin_csrf';
export function sessionCookie(name:typeof ADMIN_COOKIE|typeof CSRF_COOKIE,token:string,maxAge:number,secure:boolean):string {
 assertServerRuntime();return `${name}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.max(0,Math.floor(maxAge))}${secure?'; Secure':''}`;
}
export function profile(identity:AdminIdentity,role:AdminRole):AdminProfile {
 assertServerRuntime();return {id:identity.id,displayName:identity.displayName,avatarUrl:identity.avatarUrl,role};
}

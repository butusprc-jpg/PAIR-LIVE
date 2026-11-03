import type {AdminAllowlistEntry,AdminRole,LineIdentity} from '../types';
import {assertServerRuntime} from './runtime';
export function roleFor(identity:LineIdentity,channelId:string,allowlist:ReadonlyMap<string,AdminRole>):AdminRole|null {
 assertServerRuntime();return identity.provider==='line'&&identity.providerChannelId===channelId ? allowlist.get(identity.providerUserId)||null:null;
}
export function validIdentity(identity:LineIdentity,channelId:string):boolean {
 assertServerRuntime();return !!identity&&identity.provider==='line'&&identity.providerChannelId===channelId&&typeof identity.providerUserId==='string'&&identity.providerUserId.length>0&&identity.providerUserId.length<=255&&typeof identity.displayName==='string'&&identity.displayName.length>0&&identity.displayName.length<=1000&&(identity.avatarUrl===null||(typeof identity.avatarUrl==='string'&&/^https:\/\//.test(identity.avatarUrl)));
}
export function allowlistMap(entries:readonly AdminAllowlistEntry[]):ReadonlyMap<string,AdminRole> {
 assertServerRuntime();const map=new Map<string,AdminRole>();
 for(const entry of entries){if(!entry||typeof entry.userId!=='string'||!entry.userId.trim()||entry.userId!==entry.userId.trim()||!['admin','operator','viewer'].includes(entry.role)||map.has(entry.userId))throw new Error('admin_not_configured');map.set(entry.userId,entry.role)}
 return map;
}

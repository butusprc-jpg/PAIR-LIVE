export type MemberEntry='live'|'wallet'|'history';
export function memberEntry(search:string):MemberEntry{const value=new URLSearchParams(search).get('entry');return value==='wallet'||value==='history'?value:'live'}

export type MemberEntry='live'|'wallet'|'history'|'topup';
export function memberEntry(search:string):MemberEntry{const value=new URLSearchParams(search).get('entry');return value==='topup'||value==='wallet'||value==='history'?value:'live'}

// LIFF redirects can carry the rich-menu query inside liff.state. Only entry is read.
export function memberEntryFromLiff(search:string):MemberEntry{const q=new URLSearchParams(search);if(q.has('entry'))return memberEntry(search);const state=q.get('liff.state');if(!state||state.length>2048)return 'live';const query=state.includes('?')?state.slice(state.indexOf('?')):state;return memberEntry(query)}

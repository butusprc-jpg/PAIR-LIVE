export type MemberEntry='live'|'wallet'|'history'|'topup';
export function memberEntry(search:string):MemberEntry{const value=new URLSearchParams(search).get('entry');return value==='topup'||value==='wallet'||value==='history'?value:'live'}

// LIFF redirects can carry the rich-menu query inside liff.state. Only entry is read.
export function memberEntryFromLiff(search:string):MemberEntry{const q=new URLSearchParams(search);if(q.has('entry'))return memberEntry(search);const state=q.get('liff.state');if(!state||state.length>2048)return 'live';const query=state.includes('?')?state.slice(state.indexOf('?')):state;return memberEntry(query)}

// LINE Rich Menu settings button can arrive as view=admin in the query or
// wrapped inside LIFF's encoded liff.state. Treat only the exact admin value
// as an admin-navigation intent; the destination still enforces admin auth.
export function adminViewFromLiff(search:string):boolean{
 const params=new URLSearchParams(search);
 if(params.get('view')==='admin')return true;
 const state=params.get('liff.state');
 if(!state||state.length>2048)return false;
 const query=state.includes('?')?state.slice(state.indexOf('?')):state;
 return new URLSearchParams(query.replace(/^\?/,'')).get('view')==='admin';
}

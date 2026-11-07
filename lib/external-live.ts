export type ExternalLiveProvider='youtube'|'vimeo';
export type ExternalLiveStatus='OFFLINE'|'READY'|'LIVE';
export type ExternalLiveState={status:ExternalLiveStatus;provider:ExternalLiveProvider|null;embedUrl:string|null;updatedAt:string};
export function parseEmbedUrl(input:unknown):{provider:ExternalLiveProvider;embedUrl:string}{
 if(typeof input!=='string'||input.length>500||!input)throw new Error('invalid_live_url');
 let url:URL;try{url=new URL(input)}catch{throw new Error('invalid_live_url')}
 if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash||url.search||input!==url.href)throw new Error('invalid_live_url');
 const youtube=/^\/embed\/([A-Za-z0-9_-]{11})$/;
 const vimeo=/^\/video\/([1-9][0-9]{0,15})$/;
 if((url.hostname==='www.youtube.com'||url.hostname==='www.youtube-nocookie.com')&&youtube.test(url.pathname))return {provider:'youtube',embedUrl:`https://www.youtube-nocookie.com${url.pathname}`};
 if(url.hostname==='player.vimeo.com'&&vimeo.test(url.pathname))return {provider:'vimeo',embedUrl:`https://player.vimeo.com${url.pathname}`};
 throw new Error('unsupported_live_url');
}

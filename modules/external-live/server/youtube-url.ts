import {LiveError} from '../types';
export function parseYouTubeId(input:unknown):string{
 if(typeof input!=='string'||input.length>400||!input||input.trim()!==input)throw new LiveError('invalid_live_url');
 let url:URL;try{url=new URL(input)}catch{throw new LiveError('invalid_live_url')}
 if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash)throw new LiveError('invalid_live_url');
 const host=url.hostname.toLowerCase();
 let id:string|null=null;
 if(host==='youtube.com'||host==='www.youtube.com'){
  if(url.pathname==='/watch'){
   if([...url.searchParams.keys()].join(',')!=='v')throw new LiveError('invalid_live_url');
   id=url.searchParams.get('v');
  }else if(!url.search){id=/^\/(?:live|embed)\/([A-Za-z0-9_-]{11})$/.exec(url.pathname)?.[1]||null}
 }else if(host==='youtu.be'&&!url.search){id=/^\/([A-Za-z0-9_-]{11})$/.exec(url.pathname)?.[1]||null}
 if(!id||!/^[A-Za-z0-9_-]{11}$/.test(id))throw new LiveError('invalid_live_url');
 return id;
}
export function embedUrl(id:string){return `https://www.youtube-nocookie.com/embed/${id}`}

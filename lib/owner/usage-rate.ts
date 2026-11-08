const hits=new Map<string,{count:number;until:number}>();
export function allowUsageRead(key:string,now=Date.now()){
 if(hits.size>2048)for(const [k,v] of hits)if(v.until<now)hits.delete(k);
 const old=hits.get(key),v=old&&old.until>now?old:{count:0,until:now+60000};v.count++;hits.set(key,v);return v.count<=20;
}

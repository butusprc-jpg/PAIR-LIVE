import type {LiveMode,LiveStatus} from '../types';
export function phase(status:LiveStatus,mode:LiveMode,startedAt:Date|null,showSeconds:number,breakSeconds:number,now:Date):{status:LiveStatus;phaseEndsAt:Date|null}{
 if(!startedAt||status==='OFFLINE'||status==='READY')return {status,phaseEndsAt:null};
 const elapsed=Math.max(0,now.getTime()-startedAt.getTime());
 const show=showSeconds*1000;
 if(mode==='MANUAL')return elapsed<show?{status:'SHOWING',phaseEndsAt:new Date(startedAt.getTime()+show)}:{status:'READY',phaseEndsAt:null};
 const cycle=show+breakSeconds*1000,position=elapsed%cycle,base=now.getTime()-position;
 return position<show?{status:'SHOWING',phaseEndsAt:new Date(base+show)}:{status:'INTERMISSION',phaseEndsAt:new Date(base+cycle)};
}

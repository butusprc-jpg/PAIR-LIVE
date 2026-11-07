import type {Pool} from 'pg';
import {LiveError} from '../types';
import {connectedOa} from './authorization';
import {readLive,changeLive,type Change} from './store';
export async function adminLive(pool:Pool,channelId:string|undefined){const oa=await connectedOa(pool,channelId);return readLive(pool,oa.id,oa.active,oa.updatedAt)}
export async function memberLive(pool:Pool,member:{provider:string;provider_channel_id:string}){
 if(member.provider!=='line')throw new LiveError('line_member_required',403);
 const oa=await connectedOa(pool,member.provider_channel_id);const state=await readLive(pool,oa.id,oa.active,oa.updatedAt);
 return {...state,videoId:null};
}
export async function adminChangeLive(pool:Pool,channelId:string|undefined,actor:string,change:Change){const oa=await connectedOa(pool,channelId);return changeLive(pool,oa.id,!!oa.active,actor,change)}

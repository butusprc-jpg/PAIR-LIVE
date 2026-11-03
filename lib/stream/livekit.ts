import {AccessToken,RoomServiceClient,TokenVerifier} from 'livekit-server-sdk';
import {TrackType} from '@livekit/protocol';
export type StreamRole='publisher'|'viewer';
export type StreamStatus='LIVE'|'OFFLINE'|'NOT_CONFIGURED';
export interface StreamingAdapter {
 status():Promise<StreamStatus>;
 issueToken(role:StreamRole,identity:string):Promise<{url:string;token:string;expiresIn:number}>;
}
export const PUBLISHER_ID='pair-live-publisher';
export function liveKitConfig(){const url=process.env.LIVEKIT_URL,key=process.env.LIVEKIT_API_KEY,secret=process.env.LIVEKIT_API_SECRET;return url&&key&&secret?{url,key,secret,room:process.env.LIVEKIT_ROOM||'pair-live-main'}:null}
export class LiveKitAdapter implements StreamingAdapter {
 constructor(private config:NonNullable<ReturnType<typeof liveKitConfig>>){ }
 async status():Promise<StreamStatus>{const httpUrl=this.config.url.replace(/^ws/,'http');const service=new RoomServiceClient(httpUrl,this.config.key,this.config.secret);try{const members=await service.listParticipants(this.config.room);return members.some(p=>p.identity===PUBLISHER_ID&&p.tracks.some(t=>t.type===TrackType.VIDEO&&!t.muted))?'LIVE':'OFFLINE'}catch(error){const message=error instanceof Error?error.message:'';if(/not found|does not exist|404/i.test(message))return 'OFFLINE';throw error}}
 async issueToken(role:StreamRole,identity:string){if(role==='publisher'&&identity!==PUBLISHER_ID)throw new Error('publisher_identity_invalid');const token=new AccessToken(this.config.key,this.config.secret,{identity,ttl:'5m'});token.addGrant({room:this.config.room,roomJoin:true,canPublish:role==='publisher',canSubscribe:role==='viewer',canPublishData:false});return {url:this.config.url,token:await token.toJwt(),expiresIn:300}}
 verify(token:string){return new TokenVerifier(this.config.key,this.config.secret).verify(token,0)}
}
export function configuredAdapter(){const config=liveKitConfig();return config?new LiveKitAdapter(config):null}

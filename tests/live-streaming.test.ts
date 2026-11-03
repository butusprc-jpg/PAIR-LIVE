import test from 'node:test';
import assert from 'node:assert/strict';
import {LiveKitAdapter,PUBLISHER_ID} from '../lib/stream/livekit';
import {cameraError,requestCamera,stopCamera} from '../lib/stream/camera';
import {mockStreamBus} from '../lib/stream/mock';
const adapter=new LiveKitAdapter({url:'wss://example.test',key:'test-key',secret:'test-secret',room:'pair-live-test'});
test('viewer token is short-lived and cannot publish',async()=>{
 const result=await adapter.issueToken('viewer','member-123');const grants=await adapter.verify(result.token);
 assert.equal(result.expiresIn,300);assert.equal(grants.video?.roomJoin,true);assert.equal(grants.video?.canPublish,false);assert.equal(grants.video?.canSubscribe,true);assert.equal(grants.sub,'member-123');assert.ok(Number(grants.exp)-Math.floor(Date.now()/1000)<=300);
});
test('publisher token is limited to fixed identity and one room',async()=>{
 await assert.rejects(adapter.issueToken('publisher','member-123'),/publisher_identity_invalid/);
 const result=await adapter.issueToken('publisher',PUBLISHER_ID),grants=await adapter.verify(result.token);
 assert.equal(grants.video?.canPublish,true);assert.equal(grants.video?.canSubscribe,false);assert.equal(grants.video?.room,'pair-live-test');assert.equal(grants.sub,PUBLISHER_ID);
});
test('expired token is rejected',async()=>{
 const {AccessToken}=await import('livekit-server-sdk');const token=new AccessToken('test-key','test-secret',{identity:'expired',ttl:'1s'});token.addGrant({room:'pair-live-test',roomJoin:true,canPublish:false,canSubscribe:true});const signed=await token.toJwt();await new Promise(resolve=>setTimeout(resolve,1200));await assert.rejects(adapter.verify(signed),/exp|expired/i)
});
test('camera requests rear camera at 720p/15fps and falls back',async()=>{
 const seen:MediaStreamConstraints[]=[];const stream={getTracks:()=>[]} as unknown as MediaStream;const media={getUserMedia:async(constraints:MediaStreamConstraints)=>{seen.push(constraints);if(seen.length===1)throw new DOMException('unsupported','OverconstrainedError');return stream}} as Pick<MediaDevices,'getUserMedia'>;
 assert.equal(await requestCamera(media,'environment'),stream);assert.equal((seen[0].video as MediaTrackConstraints).facingMode instanceof Object,true);assert.equal((seen[0].video as MediaTrackConstraints).width instanceof Object,true);assert.equal(seen.length,2)
});
test('permission errors are clear and stopping releases tracks',async()=>{
 let stopped=0;stopCamera({getTracks:()=>[{stop:()=>stopped++},{stop:()=>stopped++}]} as unknown as MediaStream);assert.equal(stopped,2);assert.match(cameraError(new DOMException('denied','NotAllowedError')),/อนุญาต/)
});
test('mock transport publishes only inside current browser state and stops',()=>{
 const states:string[]=[];const unsubscribe=mockStreamBus.subscribe(state=>states.push(state.status));const stream={getTracks:()=>[]} as unknown as MediaStream;mockStreamBus.publish(stream);assert.equal(mockStreamBus.get().status,'DEMO_ACTIVE');mockStreamBus.stop();unsubscribe();assert.deepEqual(states,['OFFLINE','DEMO_ACTIVE','OFFLINE'])
});

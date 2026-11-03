/** In-tab test transport. Never presented as a real multi-viewer LIVE stream. */
export type MockState={status:'OFFLINE'|'DEMO_ACTIVE';stream:MediaStream|null};
let state:MockState={status:'OFFLINE',stream:null};
const listeners=new Set<(state:MockState)=>void>();
function emit(){for(const listener of listeners)listener(state)}
export const mockStreamBus={
 get:()=>state,
 subscribe(listener:(state:MockState)=>void){listeners.add(listener);listener(state);return()=>{listeners.delete(listener)}},
 publish(stream:MediaStream){state={status:'DEMO_ACTIVE',stream};emit()},
 stop(){state={status:'OFFLINE',stream:null};emit()},
};

export const pollDelay=(active:boolean)=>active?25_000:60_000;
/** Poll only while the page is visible; refresh immediately on return or network recovery. */
export function adaptivePoll(load:()=>Promise<boolean>,options:{onEvent?:string}={}){
 let stopped=false,busy=false,pendingWake=false,timer:ReturnType<typeof setTimeout>|undefined;
 const schedule=(active:boolean)=>{if(!stopped&&document.visibilityState==='visible')timer=setTimeout(run,pollDelay(active))};
 const run=async()=>{if(stopped||document.visibilityState!=='visible')return;if(busy){pendingWake=true;return}busy=true;if(timer)clearTimeout(timer);let active=false;try{active=await load()}catch{/* Callers render their own error state. */}finally{busy=false;if(pendingWake&&document.visibilityState==='visible'&&!stopped){pendingWake=false;void run()}else schedule(active)}};
 const wake=()=>{if(document.visibilityState==='visible'){if(timer)clearTimeout(timer);void run()}else if(timer)clearTimeout(timer)};
 void run();document.addEventListener('visibilitychange',wake);window.addEventListener('online',wake);if(options.onEvent)window.addEventListener(options.onEvent,wake);
 return()=>{stopped=true;pendingWake=false;if(timer)clearTimeout(timer);document.removeEventListener('visibilitychange',wake);window.removeEventListener('online',wake);if(options.onEvent)window.removeEventListener(options.onEvent,wake)};
}

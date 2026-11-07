'use client';
import {useEffect,useState} from 'react';
import type {LiveState} from '../types';
export function useLiveState(endpoint:string){
 const[state,setState]=useState<LiveState|null>(null),[error,setError]=useState(false),[now,setNow]=useState(Date.now()),[receivedAt,setReceivedAt]=useState(Date.now());
 useEffect(()=>{let active=true;async function refresh(){try{const response=await fetch(endpoint,{cache:'no-store'});if(!response.ok)throw new Error();const next=await response.json() as LiveState;if(active){setState(next);setReceivedAt(Date.now());setNow(Date.now());setError(false)}}catch{if(active){setError(true);setState(null)}}}void refresh();const poll=setInterval(refresh,4000),clock=setInterval(()=>setNow(Date.now()),1000);const visible=()=>{if(document.visibilityState==='visible')void refresh()};document.addEventListener('visibilitychange',visible);return()=>{active=false;clearInterval(poll);clearInterval(clock);document.removeEventListener('visibilitychange',visible)}},[endpoint]);
 const elapsed=state?now-receivedAt:0;
 const seconds=state?.phaseEndsAt?Math.max(0,Math.ceil((new Date(state.phaseEndsAt).getTime()-new Date(state.serverNow).getTime()-elapsed)/1000)):0;
 function update(next:LiveState){setState(next);setReceivedAt(Date.now());setNow(Date.now())}
 return {state,setState:update,error,seconds};
}

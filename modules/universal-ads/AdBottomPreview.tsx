'use client';
import {useEffect,useState} from 'react';
import {chooseAd,classifyContext,type Sponsor} from './placement';
/** UI-only preview. Preview artwork is NOT a real paid impression. */
export default function AdBottomPreview({preview=true,sponsor=null}:{preview?:boolean;sponsor?:Sponsor|null}){
 const [context,setContext]=useState<'line_embedded'|'embedded'|'external_candidate'>('embedded');
 useEffect(()=>setContext(classifyContext(navigator.userAgent)),[]);
 const decision=chooseAd({enabled:!preview,sponsorEnabled:true,googleEnabled:false},context,sponsor);
 if(!preview&&decision.type!=='sponsor')return null;
 return <aside aria-label="พื้นที่โฆษณา" className="pair-ad-bottom">
  <span className="pair-ad-label">โฆษณา{preview?' · ตัวอย่างทดลอง':''}</span>
  {preview?<div className="pair-ad-placeholder" aria-label="ตัวอย่างแบนเนอร์ที่ยังไม่แสดงโฆษณาจริง">พื้นที่แบนเนอร์ 320 × 50</div>:
   decision.type==='sponsor'?<a href={decision.sponsor.href} target="_blank" rel="noopener noreferrer sponsored" aria-label={decision.sponsor.alt}><img src={decision.sponsor.imageUrl} width={320} height={50} alt={decision.sponsor.alt}/></a>:null}
 </aside>
}

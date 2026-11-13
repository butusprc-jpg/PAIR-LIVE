'use client';
import {validateAffiliateCampaign,type AffiliateCampaign} from './affiliate';
export default function AffiliateBanner({campaign,enabled=false}:{campaign:AffiliateCampaign|null;enabled?:boolean}){
 const approved=enabled?validateAffiliateCampaign(campaign):null;
 if(!approved)return null;
 return <aside className="pair-ad-bottom" aria-label="โฆษณาแบบแอฟฟิลิเอต">
  <span className="pair-ad-label">โฆษณา · อาจได้รับค่าคอมมิชชันจากการซื้อ</span>
  <a href={approved.trackingUrl} target="_blank" rel="noopener noreferrer sponsored" aria-label={approved.alt}>
   <img src={approved.creativeUrl} alt={approved.alt} width={320} height={50} loading="lazy" decoding="async"/>
  </a>
 </aside>;
}

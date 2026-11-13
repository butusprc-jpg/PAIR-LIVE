import AdBottomPreview from '../../modules/universal-ads/AdBottomPreview';
import './preview.css';
export const metadata={title:'PAIR LIVE — Ads Layout Preview'};
/** Isolated test page; not linked to member navigation and no live monetization. */
export default function AdsPreview(){
 return <div className="pair-ad-preview">
  <div className="pair-ad-scroll">
   <header><b>PAIR <span>LIVE</span></b><small>ทดลองพื้นที่โฆษณา · ไม่ใช่หน้าเล่นจริง</small></header>
   <main>
    <h1>ตัวอย่างหน้าสมาชิก</h1>
    <section><h2>LIVE และการเล่น</h2><div className="pair-preview-video">ตัวอย่างพื้นที่ภาพ LIVE</div><p>ส่วนนี้จำลองตำแหน่งเนื้อหาเพื่อทดสอบว่าพื้นที่โฆษณาไม่ทับปุ่มเล่นหรือข้อมูลสมาชิก</p></section>
    <section><h2>ประวัติและรายการ</h2>{Array.from({length:7},(_,i)=><p key={i}>รายการตัวอย่าง #{i+1} — เลื่อนตรวจพื้นที่ท้ายจอ</p>)}</section>
   </main>
  </div>
  <AdBottomPreview preview/>
  <nav aria-label="เมนูตัวอย่าง" className="pair-preview-nav"><span>LIVE</span><span>สถิติ</span><span>คะแนน</span><span>โปรไฟล์</span></nav>
 </div>;
}

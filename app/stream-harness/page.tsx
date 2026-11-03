import {notFound} from 'next/navigation';
import CameraControl from '../../components/CameraControl';
import DemoMemberStream from '../../components/DemoMemberStream';
export default function StreamHarness(){if(process.env.NODE_ENV!=='development')notFound();return <main className="app shell" style={{paddingTop:24}}><div className="eyebrow">DEVELOPMENT TEST HARNESS</div><h1>กล้องและผู้ชม DEMO ในแท็บเดียว</h1><p className="muted">ทดสอบสัญญาณจำลองเท่านั้น ไม่มีการเผยแพร่ผ่านเครือข่าย</p><div className="settings-grid"><CameraControl/><div className="card"><h2>Viewer DEMO</h2><DemoMemberStream roundLabel="# TEST" clock="05:00"/></div></div></main>}

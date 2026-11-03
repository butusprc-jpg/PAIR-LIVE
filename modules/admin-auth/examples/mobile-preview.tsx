'use client';

import {AdminLogin} from '../client';

/** Display-only fixture for local screenshots. No API or authorized session is created. */
export function MobileLoginPreview() {
  return <main style={{minHeight: '100dvh', display: 'grid', alignItems: 'center', padding: '24px 18px', background: '#0b1423'}}>
    <div style={{width: '100%', maxWidth: 420, margin: 'auto'}}>
      <AdminLogin obtainAccessToken={async () => {throw new Error('not_configured');}}/>
      <p style={{color: '#8191ae', textAlign: 'center', font: '11px Arial', marginTop: 22}}>PAIR LIVE · ภาพตัวอย่างโมดูลผู้ดูแล</p>
    </div>
  </main>;
}

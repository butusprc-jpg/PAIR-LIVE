'use client';

import {useState} from 'react';
import {adminRequest, challenge, clientError, type AdminClientError, type AdminClientSession} from './http';
import styles from './styles.module.css';

export type AdminLoginProps = {
  loginEndpoint?: string;
  challengeEndpoint?: string;
  /** Reuse PAIR LIVE's LIFF helper, or inject the host application's existing helper. */
  obtainAccessToken?: () => Promise<string | null>;
  onAuthenticated?: (session: AdminClientSession) => void;
  onError?: (error: AdminClientError) => void;
};

async function existingLineToken(): Promise<string | null> {
  const {initLIFF} = await import('../../../lib/liff');
  const login = await initLIFF();
  return login?.accessToken ?? null;
}

export function AdminLogin({loginEndpoint = '/api/admin/auth/login', challengeEndpoint = '/api/admin/auth/challenge', obtainAccessToken = existingLineToken, onAuthenticated, onError}: AdminLoginProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AdminClientError | null>(null);
  const [authenticated, setAuthenticated] = useState(false);

  async function login() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const accessToken = await obtainAccessToken();
      if (!accessToken) return; // LIFF redirects to LINE; no session is assumed.
      const csrfToken = await challenge(challengeEndpoint, 'login');
      const result = await adminRequest(loginEndpoint, {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Admin-CSRF': csrfToken}, body: JSON.stringify({accessToken})});
      if (!result.session || typeof result.session !== 'object') throw new Error('request_failed');
      setAuthenticated(true);
      onAuthenticated?.(result.session as AdminClientSession);
    } catch (cause) {
      const failure = clientError(cause);
      setError(failure);
      onError?.(failure);
    } finally {
      setBusy(false);
    }
  }

  return <section className={styles.card} aria-labelledby="pair-admin-login-title">
    <div className={styles.brand}>PAIR <span>LIVE</span><span className={styles.adminBadge}>ADMIN</span></div>
    <div className={styles.shield} aria-hidden="true"><svg width="30" height="34" viewBox="0 0 30 34" fill="none"><path d="M15 2 27 7v9c0 7-5 12-12 16C8 28 3 23 3 16V7L15 2Z" stroke="currentColor" strokeWidth="2"/><path d="m9 17 4 4 8-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
    <p className={styles.eyebrow}>พื้นที่สำหรับผู้ดูแลระบบ</p>
    <h1 id="pair-admin-login-title" className={styles.title}>เข้าสู่ระบบผู้ดูแล</h1>
    <p className={styles.description}>ใช้บัญชี LINE ที่ได้รับอนุญาต<br/>เพื่อเข้าใช้งานระบบจัดการ PAIR LIVE</p>
    <button className={styles.lineButton} type="button" onClick={login} disabled={busy || authenticated} aria-busy={busy}>
      <span className={styles.lineIcon} aria-hidden="true">LINE</span>
      {busy ? 'กำลังยืนยันตัวตน…' : authenticated ? 'เข้าสู่ระบบแล้ว' : 'เข้าสู่ระบบด้วย LINE'}
    </button>
    {error && <p className={styles.error} role="alert">{error.message}</p>}
    {authenticated && <p className={styles.success} role="status">ยืนยันสิทธิ์ผู้ดูแลเรียบร้อยแล้ว</p>}
    <div className={styles.notice}><span aria-hidden="true">◈</span><p>เฉพาะบัญชีที่ได้รับสิทธิ์ผู้ดูแลเท่านั้น<br/>บัญชีสมาชิกทั่วไปไม่สามารถเข้าใช้งานได้</p></div>
    <p className={styles.footer}>ยืนยันตัวตนผ่าน LINE อย่างปลอดภัย</p>
  </section>;
}

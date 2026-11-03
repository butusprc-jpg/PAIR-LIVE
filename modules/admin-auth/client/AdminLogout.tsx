'use client';

import {useState} from 'react';
import {adminRequest, challenge, clientError, type AdminClientError} from './http';
import styles from './styles.module.css';

export type AdminLogoutProps = {logoutEndpoint?: string; challengeEndpoint?: string; onLoggedOut?: () => void; onError?: (error: AdminClientError) => void};

export function AdminLogout({logoutEndpoint = '/api/admin/auth/logout', challengeEndpoint = '/api/admin/auth/challenge', onLoggedOut, onError}: AdminLogoutProps) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<AdminClientError | null>(null);

  async function logout() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const csrfToken = await challenge(challengeEndpoint, 'logout');
      await adminRequest(logoutEndpoint, {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Admin-CSRF': csrfToken}, body: '{}'});
      setDone(true);
      setConfirming(false);
      onLoggedOut?.();
    } catch (cause) {
      const failure = clientError(cause);
      setError(failure);
      onError?.(failure);
    } finally {
      setBusy(false);
    }
  }

  if (done) return <p className={styles.success} role="status">ออกจากระบบผู้ดูแลแล้ว</p>;
  return <div className={styles.logout}>
    {!confirming ? <button type="button" className={styles.secondaryButton} onClick={() => setConfirming(true)}>ออกจากระบบ</button> : <div className={styles.confirmation}>
      <p>ยืนยันการออกจากระบบผู้ดูแล?</p>
      <div className={styles.actions}><button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => setConfirming(false)}>ยกเลิก</button><button type="button" className={styles.confirmButton} disabled={busy} aria-busy={busy} onClick={logout}>{busy ? 'กำลังออกจากระบบ…' : 'ยืนยันออกจากระบบ'}</button></div>
    </div>}
    {error && <p className={styles.error} role="alert">{error.message}</p>}
  </div>;
}

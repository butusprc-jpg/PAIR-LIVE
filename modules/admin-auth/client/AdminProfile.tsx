'use client';
import {useLanguage} from '../../../lib/LanguageProvider';
import {t,formatDate} from '../../../lib/i18n';
import {adminStatus} from '../../../lib/admin-display';

import type {AdminClientSession} from './http';
import styles from './styles.module.css';

export type AdminProfileProps = {session: AdminClientSession | null; status?: 'active' | 'expired' | 'revoked'};
const roles = {admin: 'ผู้ดูแลระบบ', operator: 'ผู้ปฏิบัติงาน', viewer: 'ผู้ตรวจสอบ'};

export function AdminProfile({session, status = 'active'}: AdminProfileProps) {const {locale}=useLanguage();const ui=(key:string,values:Record<string,string|number>={})=>t(key,locale,values);
  if (!session) return <section className={styles.profile} role="status">{ui("ยังไม่ได้เข้าสู่ระบบผู้ดูแล")}</section>;
  const active = status === 'active' && session.expiresAt > Date.now();
  const avatar = session.admin.avatarUrl?.startsWith('https://') ? session.admin.avatarUrl : null;
  return <section className={styles.profile} aria-label={ui('บัญชีผู้ดูแล')}>
    <div className={styles.avatar}>{avatar ? <img src={avatar} alt="" referrerPolicy="no-referrer"/> : <span aria-hidden="true">{session.admin.displayName.slice(0, 1)}</span>}</div>
    <div className={styles.profileInfo}><strong>{session.admin.displayName}</strong><span>{adminStatus(session.admin.role,locale)}</span><span className={active ? styles.success : styles.error}>{ui(active ? ui("เซสชันใช้งานอยู่") : status === 'revoked' ? ui("เซสชันถูกเพิกถอน") : ui("เซสชันหมดอายุ"))}</span></div>
  </section>;
}

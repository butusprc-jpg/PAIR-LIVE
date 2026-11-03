'use client';

export type AdminClientSession = {
  admin: {id: string; displayName: string; avatarUrl: string | null; role: 'admin' | 'operator' | 'viewer'};
  expiresAt: number;
};

export type AdminClientError = {code: string; message: string};

const messages: Record<string, string> = {
  forbidden: 'บัญชี LINE นี้ไม่มีสิทธิ์ผู้ดูแล กรุณาติดต่อผู้ดูแลระบบ',
  admin_forbidden: 'บัญชี LINE นี้ไม่มีสิทธิ์ผู้ดูแล กรุณาติดต่อผู้ดูแลระบบ',
  admin_not_allowed: 'บัญชี LINE นี้ไม่มีสิทธิ์ผู้ดูแล กรุณาติดต่อผู้ดูแลระบบ',
  unauthorized: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง',
  session_invalid: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง',
  csrf_invalid: 'คำขอหมดอายุ กรุณาลองอีกครั้ง',
  invalid_csrf: 'คำขอหมดอายุ กรุณาลองอีกครั้ง',
  not_configured: 'ระบบผู้ดูแลยังไม่พร้อมใช้งาน กรุณาติดต่อผู้ดูแลระบบ',
  admin_not_configured: 'ระบบผู้ดูแลยังไม่พร้อมใช้งาน กรุณาติดต่อผู้ดูแลระบบ',
  identity_invalid: 'ไม่สามารถยืนยันบัญชี LINE ได้ กรุณาเข้าสู่ระบบอีกครั้ง',
  service_unavailable: 'ระบบยืนยันตัวตนไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง',
};

export function clientError(error: unknown): AdminClientError {
  const code = error instanceof Error ? error.message : 'request_failed';
  return {code, message: messages[code] ?? 'ไม่สามารถดำเนินการได้ กรุณาลองอีกครั้ง'};
}

export async function adminRequest(endpoint: string, init?: RequestInit): Promise<Record<string, unknown>> {
  // Tokens must only be sent to this application's origin, even when hosts configure custom paths.
  const url = new URL(endpoint, window.location.href);
  if (url.origin !== window.location.origin || url.username || url.password) throw new Error('invalid_endpoint');
  const response = await fetch(url, {...init, credentials: 'same-origin', cache: 'no-store'});
  const result = await response.json() as Record<string, unknown>;
  if (!response.ok || result.ok !== true) {
    const error = result.error;
    throw new Error(typeof error === 'string' ? error : typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : 'request_failed');
  }
  return result;
}

export async function challenge(endpoint: string, purpose: 'login' | 'logout'): Promise<string> {
  const result = await adminRequest(endpoint, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({purpose})});
  if (typeof result.csrfToken !== 'string') throw new Error('request_failed');
  return result.csrfToken;
}

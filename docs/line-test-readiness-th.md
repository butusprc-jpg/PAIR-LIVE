# PAIR LIVE V1.1 งาน 2/4: คู่มือทดสอบ LINE จริง

สถานะปัจจุบัน: **REAL INTEGRATION = NOT TESTED** เพราะยังไม่มี LINE credentials, public HTTPS test origin หรือ PostgreSQL test database ใน workspace นี้ ห้ามนำ `.env.example` ไปใช้เป็นค่าจริง และห้ามเปิดให้สมาชิกทั่วไปจนกว่าจะผ่านการทดสอบกับบัญชีทดสอบ

## เตรียม HTTPS test environment

1. ใช้ staging host จริงที่มี HTTPS, TLS certificate ที่เชื่อถือได้ และ PostgreSQL แยกจาก production ตั้ง environment variables ตาม `.env.example` ใน secret store ของ hosting อย่า commit `.env` หรือพิมพ์ค่า secret ใน log
2. ตั้ง `NEXT_PUBLIC_APP_BASE_URL` เป็น origin HTTPS จริง และ `ADMIN_AUTH_ORIGIN` ให้ตรงกัน ตั้ง `DATABASE_URL` ของ test database, ใช้ migrations `001`–`008` ตามลำดับ จากนั้นลง module migrations ตามคู่มือแต่ละโมดูล เก็บ backup ก่อน migration
3. รัน `npm run line:preflight` บน staging เพื่อดูเพียง CONFIGURED/MISSING/INVALID ค่านี้ตรวจรูปแบบและการมีค่าเท่านั้น **ไม่ได้** ยืนยันว่า LINE ยอมรับ credentials หรือ database เชื่อมต่อได้
4. ตรวจ HTTPS, cookie `Secure`, `HttpOnly`, `SameSite=Lax`, session expiry, CSRF origin, unauthorized API 401 และ admin allowlist ด้วยบัญชีทดสอบ ตั้ง `NOTIFICATION_DELIVERY_ENABLED=false` และ `PAIR_WALLET_CUTOVER_VERIFIED=false`
5. ทดสอบหลัง restart server ด้วย; ห้ามถือว่าหน้า DEMO ใน development เป็นหลักฐาน production login

## LINE Developers Console

- สร้าง/ตรวจ LINE Login channel และ LIFF app แยกจาก Messaging API channel ของ OA ระบุ LIFF endpoint เป็น `https://<staging-host>/` จริง Scope `profile` และ `openid`; ตั้ง callback/redirect ให้สอดคล้องกับ LIFF SDK และ domain ที่ลงทะเบียน
- ตั้ง `NEXT_PUBLIC_LINE_LIFF_ID`, `LINE_LOGIN_CHANNEL_ID`, `LINE_LOGIN_CHANNEL_SECRET` ของ Login channel บน staging. Backend ตรวจ access token กับ LINE verify endpoint, ตรวจ channel ID/expiry แล้วดึง profile จาก LINE ฝั่งเซิร์ฟเวอร์
- ตั้ง Messaging channel ID/Secret/Access Token แยกกัน แล้วกำหนด webhook `https://<staging-host>/api/line/webhook` ทดสอบ Verify จาก Console โดยต้องได้ signed request จริง; request ว่าง `events: []` ที่ลายเซ็นถูกต้องตอบ 200
- เปิด webhook delivery และตรวจ redelivery โดยใช้ event ID เดิม; ตารางบันทึก receipt เพียงครั้งเดียว ส่วน `processing_status=RECEIVED` หมายถึงยังไม่มี business handler. งานนี้ยังไม่ตอบข้อความอัตโนมัติ

## LINE OA Manager

- ตรวจภาพ `assets/line/rich-menu.png` และพื้นที่กดจาก template; แทน `REPLACE_LIFF_ID` ด้วย LIFF ID จริงก่อนติดตั้ง Rich Menu ใน OA Manager
- ทดสอบ LIVE (`?entry=live`), แต้ม DEMO (`?entry=wallet`), ประวัติ (`?entry=history`) และปุ่มติดต่อแอดมินที่ส่งข้อความเข้า OA Chat ด้วยบัญชีทดสอบบน LINE Android/iOS; ไม่เปิด rich menu นี้ให้สมาชิกทั่วไปในขั้นทดสอบ

## Test matrix ที่ต้องทำบนสภาพแวดล้อมจริง

- LINE in-app Android/iOS: ยังไม่ login, login แล้ว, token หมดอายุ, login ล้มเหลว, session หมดอายุ, logout/login ใหม่, กลับเข้าจาก Rich Menu, member ID เดิม
- Chrome Android, Safari iOS, Desktop Chrome: external LIFF ตามที่ provider รองรับ, loading/error, deep link หลัง reload, ไม่มี open redirect, wallet/history อ่านได้เฉพาะสมาชิกเจ้าของ
- Webhook: signature, content type, body size, invalid JSON, duplicate/redelivery, database outage/retry; ตรวจแถว `RECEIVED` ใน PostgreSQL และความเป็น unique ของ `event_id`
- Admin: allowlist, session, CSRF, Login channel role และไม่มีสิทธิ์ admin จาก OA profile เพียงอย่างเดียว

การทดสอบ mock HTTP/Chromium emulation ไม่เท่ากับ LINE delivery หรือเครื่องจริง; บันทึกผลแยกกันก่อนตรวจรับ

## Browser investigation ใน workspace นี้

ทดสอบ Chromium headless บน Linux ที่ 390px ผ่าน Next dev server, ไม่มี LINE SDK credentials. รอบแรกหน้า LIVE เคยได้ `pageerror: Event` โดยไม่มี stack trace; console ชี้ `ERR_TUNNEL_CONNECTION_FAILED` ที่ Google Fonts, `404 /favicon.ico` และ `401 /api/auth/session` ซึ่งเป็นผลที่คาดใน DEMO ไม่มี session. รอบสืบสวนซ้ำด้วย `window.addEventListener('error', ..., true)` พบ `error` target เป็น stylesheet ของ Next dev server ระหว่างโหลด แต่ **ไม่พบ pageerror หรือ unhandled rejection จาก component** ในรอบนั้น. จึงจัด `Event` เดิมเป็น **NOT REPRODUCED** และยังไม่ระบุ mock media เป็นสาเหตุ. LIVE, Wallet และ History แสดงผลได้ ไม่มี horizontal overflow ที่ 390px; ต้องตรวจซ้ำบน hosting และอุปกรณ์จริงพร้อม stack trace ก่อนปิดประเด็นถาวร

## ข้อจำกัดก่อนเปิดให้ใช้งานจริง

ยังไม่มี PostgreSQL integration test สำหรับ migration 008, unique event ID และ rollback/recovery; ชุดทดสอบ duplicate ปัจจุบันเป็น mock store. ยังไม่มีการทดสอบ LINE SDK กับอุปกรณ์จริง, LINE delivery, รหัสผ่าน/secret ของผู้ให้บริการจริง หรือ HTTPS host จริง. Member Login API ยังไม่มี rate limiter แบบ shared-store สำหรับหลาย instance; ต้องกำหนดข้อจำกัดที่ edge/hosting และทดสอบก่อนเปิด public access. Webhook เก็บ `RECEIVED` เท่านั้น ยังไม่มีกระบวนการประมวลผล follow/unfollow/message เป็นธุรกิจ และไม่มี auto-reply

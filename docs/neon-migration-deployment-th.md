# แผนติดตั้ง migration PAIR LIVE บน Neon

งานนี้ **ยังไม่ติดตั้งบน Neon production** และไม่มีคำสั่ง deploy อัตโนมัติใน build หรือ Git push. ติดตั้งจริงได้หลังตรวจรับ, สำรองข้อมูล และใช้บัญชีที่ได้รับอนุญาตเท่านั้น

## ลำดับและสิ่งที่ตรวจแล้ว

`npm run db:migrate -- --dry-run|--validate|--apply` ใช้ `MIGRATION_TEST_DATABASE_URL` และรับเฉพาะ PostgreSQL localhost ฐานชื่อ `pair_live_migration_test`; จึงไม่สามารถชี้ runner นี้ไป Neon production ได้. Manifest ใน `lib/migration-manifest.ts` มี 12 ไฟล์: 11 ไฟล์เดิมตามลำดับ dependency ที่ระบุในคำขอ และ `009_evidence_verification_decisions.sql` ต่อท้าย. SHA-256 ของเนื้อหาแต่ละไฟล์บันทึกใน `schema_migration_history`; runner หยุดเมื่อ hash เปลี่ยน, ลำดับมีช่องว่าง, พบ migration ไม่รู้จัก หรือฐานที่มีตารางเดิมแต่ไม่มี history. ใช้ advisory lock และ transaction ต่อไฟล์; ล้มเหลวแล้ว rollback เฉพาะไฟล์นั้น

## Test branch / local database

1. สำรอง Neon ด้วย snapshot/branch ตามเครื่องมือ Neon และยืนยันชื่อ project, branch, database, role และ region. สร้าง Neon **test branch แยก credentials** จาก `pair-live-db` production; อย่าส่ง URL ลง Git หรือ log
2. สำหรับทดสอบอัตโนมัติใน workspace ใช้ PostgreSQL localhost แยกชื่อ `pair_live_migration_test` แล้วตั้ง `MIGRATION_TEST_DATABASE_URL` ใน shell ส่วนตัว. รัน `npm run db:migrate -- --dry-run`, `--apply`, `--validate`, และ `--apply` ซ้ำ. ตรวจจำนวนแถวและ hash ใน `schema_migration_history` ต้องเท่ากับ 12
3. ตรวจ PostgreSQL version, database name, tables และ role แบบ read-only ด้วย `DATABASE_READONLY_URL` และ `EXPECTED_DATABASE_NAME` แล้วรัน `npm run db:metadata`. คำสั่งนี้ไม่พิมพ์ URL/password. ถ้าพบตารางอื่นหรือ migration history ไม่ตรง ให้หยุดตรวจ ไม่สั่ง apply
4. ตรวจ `member_wallet_runtime_state`: `phase='LEGACY'`, `enabled=false`, `ever_cutover=false`. ตรวจ `report_notification_settings.enabled=false`. ตรวจ RLS/policies, Foreign Keys, triggers และ unique constraints ด้วย test SQL ตามชุด integration tests. ห้ามสร้าง `ROUND_SETTLED` ตัวอย่างใน production
5. ทดสอบ member/admin sessions ด้วยบัญชีทดสอบ, LINE webhook signature และ event ID ซ้ำบน staging. ตรวจ LIFF login จาก LINE Android/iOS และ Rich Menu หลังตั้งค่า channel/HTTPS จริง

## ขั้นตอน production หลังได้รับอนุมัติแยกต่างหาก

1. สำรอง Neon production และทดสอบการกู้คืนก่อน. ตรวจ `DATABASE_URL` โดยเทียบ host, project, database, branch และ role ผ่าน console/secret store; ห้ามพิมพ์ค่า URL ออก log
2. ใช้คำสั่ง metadata แบบ read-only และตรวจตาราง/ประวัติ migration ในฐานเป้าหมาย. ถ้าเป็นฐานว่างจริงและผลทดสอบ branch ผ่านทั้งหมด จึงจัดทำแผนติดตั้งด้วย migration role ที่จำกัดสิทธิ์. Runner ใน repo นี้ **ปฏิเสธ Neon production โดยตั้งใจ**; ห้ามแก้ guard เพื่อข้ามการตรวจรับ
3. ติดตั้งตาม manifest ทีละไฟล์ใน transaction พร้อม advisory lock และบันทึก hash/history. ถ้าไฟล์ใดล้มเหลว ให้หยุด, ตรวจ error และสถานะ history, แก้ด้วย migration ใหม่แบบ forward-only; ห้ามแก้ไฟล์เก่าที่ติดตั้งแล้วหรือ reset ข้อมูล
4. ตรวจ tables, RLS, sessions, webhook, wallet gate และ notification gate หลังติดตั้ง. Redeploy Vercel เฉพาะหลังแผน production ได้รับอนุมัติ และทดสอบ LIFF login ด้วยบัญชีทดสอบก่อนเปิดใช้งาน

OCR evidence migration 003 ยังคง trigger ห้าม UPDATE/DELETE หลักฐาน; migration 009 ใช้ decision table แบบ append-only พร้อม actor และ timestamp. การยืนยันหลักฐานผ่านแอปต้องอยู่หลัง admin authorization และตรวจ hash ของภาพจริง; งานนี้ยังไม่เปิด endpoint สำหรับยืนยัน

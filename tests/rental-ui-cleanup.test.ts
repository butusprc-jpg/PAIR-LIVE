import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('rental-facing UI has no orphaned simulation card or demo labels', async () => {
 const admin = await readFile(new URL('../app/admin/page.tsx',import.meta.url),'utf8');
 const ocr = await readFile(new URL('../components/AdminOcrRoi.tsx',import.meta.url),'utf8');
 const wallet = await readFile(new URL('../modules/member-wallet/client/MemberWallet.tsx',import.meta.url),'utf8');
 const history = await readFile(new URL('../modules/member-wallet/client/WalletHistory.tsx',import.meta.url),'utf8');
 const reports = await readFile(new URL('../components/AdminReports.tsx',import.meta.url),'utf8');
 assert.doesNotMatch(admin,/AdminPointsSimulation|SIMULATION ONLY/);
 assert.doesNotMatch(admin,/AdminExternalLive|AdminLivePanel|การเชื่อมต่อกล้องขั้นสูง/);
 assert.match(admin,/<AdminCameras role=\{role!\}\/>/);
 assert.doesNotMatch(ocr,/AdminPointsSimulation|จำลองหยุดรอบ|SIMULATION ONLY/);
 assert.doesNotMatch(wallet,/แต้ม DEMO|กระเป๋าแต้มสาธิต/);
 assert.doesNotMatch(history,/แต้ม DEMO|รายการแต้มสาธิต/);
 assert.match(history,/shortRef\(e\.referenceId\)/);
 assert.match(reports,/shortRef\(row\.id\)/);
 assert.match(ocr,/ยังไม่ใช่ผลยืนยัน/);
});

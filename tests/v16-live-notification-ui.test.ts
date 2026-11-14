import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('LIVE notification opt-in is explicit, visible to members and counted on admin camera page',async()=>{
 const member=await readFile(new URL('../app/page.tsx',import.meta.url),'utf8');
 const camera=await readFile(new URL('../components/AdminCameras.tsx',import.meta.url),'utf8');
 const server=await readFile(new URL('../modules/external-live/server/cameras.ts',import.meta.url),'utf8');
 assert.match(member,/รับแจ้งเตือน LINE เมื่อเริ่ม LIVE และเริ่มนับถอยหลัง/);
 assert.match(member,/\/api\/member\/countdown-notifications/);
 assert.match(camera,/lineNoticeRecipients/);
 assert.match(camera,/ยังไม่มีสมาชิกเปิดรับแจ้งเตือน LINE/);
 assert.match(server,/member_countdown_line_preferences/);
 assert.match(server,/p\.enabled=true/);
 assert.match(server,/provider_channel_id=\$1/);
 assert.match(server,/INSERT INTO live_start_line_outbox/);
});

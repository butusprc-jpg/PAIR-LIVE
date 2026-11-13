import test from 'node:test';
import assert from 'node:assert/strict';
import {cameraLayout,cameraName,primaryStreamId} from '../server/cameras';

test('camera layout covers 0–4 and rejects a fifth camera',()=>{
 assert.deepEqual([0,1,2,3,4].map(cameraLayout),['empty','single','double','featured','quad']);
 assert.throws(()=>cameraLayout(5),/camera_limit_exceeded/);
});
test('primary VDO.Ninja URL accepts only one strict view stream',()=>{
 assert.equal(primaryStreamId('https://vdo.ninja/?view=main_12345'),'main_12345');
 for(const url of ['http://vdo.ninja/?view=main_12345','https://evil.example/?view=main_12345','https://vdo.ninja.evil.example/?view=main_12345','https://vdo.ninja/?push=main_12345','https://vdo.ninja/?view=main_12345&room=x','https://vdo.ninja/?view=short','https://vdo.ninja/?view=main_12345#x','https://vdo.ninja/other?view=main_12345'])assert.throws(()=>primaryStreamId(url),/invalid_viewer_url/);
});
test('camera and site names reject blanks, controls and markup',()=>{
 assert.equal(cameraName(' กล้องโต๊ะ 1 '),'กล้องโต๊ะ 1');
 for(const invalid of ['', '   ', 'a'.repeat(81),'<img>', 'A\nB'])assert.throws(()=>cameraName(invalid),/invalid_camera_name/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {cameraLayout,cameraName} from '../server/cameras';

test('camera layout covers 0–4 and rejects a fifth camera',()=>{
 assert.deepEqual([0,1,2,3,4].map(cameraLayout),['empty','single','double','featured','quad']);
 assert.throws(()=>cameraLayout(5),/camera_limit_exceeded/);
});
test('camera and site names reject blanks, controls and markup',()=>{
 assert.equal(cameraName(' กล้องโต๊ะ 1 '),'กล้องโต๊ะ 1');
 for(const invalid of ['', '   ', 'a'.repeat(81),'<img>', 'A\nB'])assert.throws(()=>cameraName(invalid),/invalid_camera_name/);
});

import test from 'node:test';import assert from 'node:assert/strict';import {viewerUrl,publisherUrl} from '../server/vdo-ninja';
test('VDO.Ninja publisher URL adds a remote control key while viewer URL does not',()=>{assert.equal(viewerUrl('UzsGTCK'),'https://vdo.ninja/?view=UzsGTCK');assert.equal(publisherUrl('UzsGTCK','testkey'),'https://vdo.ninja/?push=UzsGTCK&api=testkey')});

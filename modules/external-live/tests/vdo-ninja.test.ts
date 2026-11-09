import test from 'node:test';import assert from 'node:assert/strict';import {viewerUrl,publisherUrl} from '../server/vdo-ninja';
test('VDO.Ninja viewer and publisher URLs use one tenant stream ID but separate modes',()=>{assert.equal(viewerUrl('UzsGTCK'),'https://vdo.ninja/?view=UzsGTCK');assert.equal(publisherUrl('UzsGTCK'),'https://vdo.ninja/?push=UzsGTCK')});

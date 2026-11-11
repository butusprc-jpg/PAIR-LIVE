import test from 'node:test';
import assert from 'node:assert/strict';
import {startRoundForLive} from '../lib/rounds/store';

test('legacy LIVE activation cannot create a round',async()=>{
 await assert.rejects(startRoundForLive('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002'),/use_manual_round_start/);
});

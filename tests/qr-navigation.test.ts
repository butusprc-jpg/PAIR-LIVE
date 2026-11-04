import test from 'node:test';
import assert from 'node:assert/strict';
import {isLineWebView} from '../lib/topup/qr-navigation';

test('recognizes LINE in-app and LIFF user agents regardless of isInClient()',()=>{
 assert.equal(isLineWebView('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Line/15.20.0'),true);
 assert.equal(isLineWebView('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Line/15.20.0'),true);
 assert.equal(isLineWebView('Mozilla/5.0 (Linux; Android 14) Chrome/126.0 Mobile Safari/537.36'),false);
 assert.equal(isLineWebView('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Safari/604.1'),false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {parseEmbedUrl} from '../lib/external-live';

test('accepts only exact provider embed URLs and normalizes YouTube privacy domain',()=>{
 assert.deepEqual(parseEmbedUrl('https://www.youtube.com/embed/abcdefghijk'),{provider:'youtube',embedUrl:'https://www.youtube-nocookie.com/embed/abcdefghijk'});
 assert.deepEqual(parseEmbedUrl('https://player.vimeo.com/video/123456'),{provider:'vimeo',embedUrl:'https://player.vimeo.com/video/123456'});
});
test('rejects share links, scripts, credentials, query strings and unapproved hosts',()=>{
 for(const value of ['https://youtu.be/abcdefghijk','https://www.youtube.com/watch?v=abcdefghijk','https://www.youtube.com/live/abcdefghijk','https://player.vimeo.com/video/123?autoplay=1','https://evil.test/embed/abcdefghijk','javascript:alert(1)','http://www.youtube.com/embed/abcdefghijk','https://user:secret@www.youtube.com/embed/abcdefghijk','https://www.youtube.com:444/embed/abcdefghijk','https://www.youtube.com/embed/abcdefghijk#secret','https://player.vimeo.com/video/0','https://player.vimeo.com/video/123/extra','https://streamkey@example.com/live'])assert.throws(()=>parseEmbedUrl(value),/invalid_live_url|unsupported_live_url/,value);
});

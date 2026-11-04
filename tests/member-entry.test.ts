import test from 'node:test';import assert from 'node:assert/strict';import {memberEntry,memberEntryFromLiff,adminViewFromLiff} from '../lib/member-entry';
test('rich menu entries survive encoded URL and reject external redirects',()=>{assert.equal(memberEntry('?entry=live'),'live');assert.equal(memberEntry('?entry=wallet'),'wallet');assert.equal(memberEntry('?entry=history'),'history');assert.equal(memberEntry('?entry=%77allet'),'wallet');assert.equal(memberEntry('?entry=https%3A%2F%2Fevil.example'),'live')});

test('topup routes support existing rich menu and LIFF state without external redirect',()=>{assert.equal(memberEntry('?entry=topup'),'topup');assert.equal(memberEntryFromLiff('?liff.state=%3Fentry%3Dwallet'),'wallet');assert.equal(memberEntryFromLiff('?liff.state=%2F%3Fentry%3Dtopup'),'topup');assert.equal(memberEntryFromLiff('?entry=history&liff.state=%3Fentry%3Dwallet'),'history')});

test('admin settings menu navigates from direct or LIFF-wrapped view without external URL injection',()=>{
 assert.equal(adminViewFromLiff('?view=admin'),true);
 assert.equal(adminViewFromLiff('?liff.state=%3Fview%3Dadmin'),true);
 assert.equal(adminViewFromLiff('?liff.state=%2F%3Fview%3Dadmin'),true);
 assert.equal(adminViewFromLiff('?entry=wallet'),false);
 assert.equal(adminViewFromLiff('?view=administrator'),false);
 assert.equal(adminViewFromLiff('?liff.state=%3Fview%3Dhttps%3A%2F%2Fevil.example'),false);
});

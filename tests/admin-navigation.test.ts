import test from 'node:test';
import assert from 'node:assert/strict';
import {canOpenAdmin} from '../lib/client/admin-navigation';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
import {AdminSettingsLink} from '../components/AdminSettingsLink';

test('admin gear is hidden until the server confirms an admin role',async()=>{
 assert.equal(renderToStaticMarkup(createElement(AdminSettingsLink)), '');
 for(const response of [Response.json({ok:false},{status:401}),Response.json({ok:true,session:{admin:{role:'viewer'}}}),Response.json({ok:true,session:{admin:{role:'member'}}}),Response.json({ok:true,session:{admin:{role:'admin'}}},{status:503})]){
  assert.equal(await canOpenAdmin((async()=>response) as typeof fetch),false);
 }
 let requested='';let options:RequestInit|undefined;
 assert.equal(await canOpenAdmin((async(url:string,init?:RequestInit)=>{requested=url;options=init;return Response.json({ok:true,session:{admin:{role:'admin'}}})}) as typeof fetch),true);
 assert.equal(requested,'/api/admin/auth/session');assert.equal(options?.credentials,'same-origin');assert.equal(options?.cache,'no-store');
 assert.equal(await canOpenAdmin((async()=>{throw Error('offline')}) as typeof fetch),false);
});

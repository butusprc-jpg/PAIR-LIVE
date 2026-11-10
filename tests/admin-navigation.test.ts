import test from 'node:test';
import assert from 'node:assert/strict';
import {adminNavigationStatus,canOpenAdmin} from '../lib/client/admin-navigation';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
import {AdminSettingsLink} from '../components/AdminSettingsLink';

test('admin gear is hidden until the server confirms an admin role',async()=>{
 assert.equal(renderToStaticMarkup(createElement(AdminSettingsLink)), '');
 for(const response of [Response.json({ok:false},{status:401}),Response.json({ok:false},{status:403}),Response.json({ok:true,session:{admin:{role:'member'}}}),Response.json({ok:true,session:{admin:{role:'admin'}}},{status:503})]){
  assert.equal(await canOpenAdmin((async()=>response) as typeof fetch),false);
 }
 for(const role of ['admin','operator','viewer'])assert.equal(await canOpenAdmin((async()=>Response.json({ok:true,session:{admin:{role}}})) as typeof fetch),true);
 assert.equal(await adminNavigationStatus((async()=>Response.json({ok:false,error:'session_invalid'},{status:401})) as typeof fetch),'unauthenticated');
 assert.equal(await adminNavigationStatus((async()=>Response.json({ok:false,error:'admin_forbidden'},{status:403})) as typeof fetch),'forbidden');
 assert.equal(await adminNavigationStatus((async()=>Response.json({error:'service_unavailable'},{status:503})) as typeof fetch),'unavailable');
 let requested='';let options:RequestInit|undefined;
 assert.equal(await canOpenAdmin((async(url:string,init?:RequestInit)=>{requested=url;options=init;return Response.json({ok:true,session:{admin:{role:'admin'}}})}) as typeof fetch),true);
 assert.equal(requested,'/api/admin/auth/session');assert.equal(options?.credentials,'same-origin');assert.equal(options?.cache,'no-store');
 assert.equal(await canOpenAdmin((async()=>{throw Error('offline')}) as typeof fetch),false);
 assert.equal(await adminNavigationStatus((async()=>{throw Error('offline')}) as typeof fetch),'unavailable');
});

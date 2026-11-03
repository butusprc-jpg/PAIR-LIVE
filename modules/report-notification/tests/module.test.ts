import test from 'node:test';
import assert from 'node:assert/strict';
import {createReportNotificationModule} from '../index';
import type {ReportReader,RoundSnapshot,EntrySnapshot} from '../types';
import type {NotificationStore,NotificationSettings,NotificationEvent} from '../server/notification-types';

test('composed module only queues a settled event matching the trusted round report',async()=>{
 const round:RoundSnapshot={id:'7',opensAt:'2026-11-03T00:00:00Z',closesAt:'2026-11-03T00:05:00Z',durationMinutes:5,status:'SETTLED',settledAt:'2026-11-03T00:06:00Z',resultNumber:'120',evidenceStatus:'NOT_AVAILABLE'};
 const entries:EntrySnapshot[]=[{roundId:'7',memberId:'m1',side:'even',demoPoints:20,status:'PENDING'}];
 const reader:ReportReader={getRound:async()=>round,listRoundsForBangkokDate:async()=>[round],getEntries:async()=>entries,getDeliveryCounts:async()=>({sent:0,failed:0})};
 let writes=0;
 const settings:NotificationSettings={enabled:true,recipients:[],emailFrequency:'both',dailyTimeBangkok:'09:00',updatedAt:'2026-11-03T00:00:00Z'};
 const store:NotificationStore={registerEvent:async()=>{writes++;return true},enqueue:async()=>{writes++;return true},claim:async()=>[],complete:async()=>true,getSettings:async()=>settings,updateSettings:async()=>settings,getHistory:async()=>[]};
 const accepted={send:async()=>({status:'ACCEPTED' as const})};
 const module=createReportNotificationModule({reportReader:reader,notifications:{store,line:accepted,email:accepted,wechat:accepted}});
 const base:NotificationEvent={eventId:'round:7:settled',type:'ROUND_SETTLED',source:'core',occurredAt:'2026-11-03T00:06:00Z',roundId:'7',payload:{resultNumber:'120',lastDigit:0,parity:'EVEN',evenMembers:1,evenEntries:1,evenPoints:20,oddMembers:0,oddEntries:0,oddPoints:0,evidenceStatus:'NOT_AVAILABLE'}};
 assert.deepEqual(await module.enqueueNotification({...base,payload:{...base.payload,evenMembers:2}}),{ok:false,error:'INVALID_EVENT'});
 assert.equal(writes,0);
 assert.deepEqual(await module.enqueueNotification(base),{ok:true,value:0});
 assert.equal(writes,1);
 round.status='SCANNING';
 assert.deepEqual(await module.enqueueNotification({...base,eventId:'round:7:settled-late'}),{ok:false,error:'INVALID_EVENT'});
 assert.equal(writes,1);
});

'use client';
import {createRoot} from 'react-dom/client';
import {ReportDashboard,NotificationSettings} from '../client';
import type {DailyView,RoundView,SettingsView} from '../client/view-types';

/** Screenshot fixture only. No provider call, admin session, database or public route. */
const rounds:RoundView[]=[
 {id:'1042',date:'2026-11-03',opensAt:'2026-11-03T09:00:00Z',closesAt:'2026-11-03T09:05:00Z',durationMinutes:5,status:'SETTLED',ocrNumber:'801246',lastDigit:6,parity:'EVEN',evidenceStatus:'ยืนยันแล้ว',confirmedAt:'2026-11-03T09:08:00Z',even:{members:14,entries:19,points:3400},odd:{members:11,entries:17,points:2875},deliveries:{LINE:'SENT',EMAIL:'SENT',WECHAT:'NOT_SUPPORTED'}},
 {id:'1043',date:'2026-11-03',opensAt:'2026-11-03T09:05:00Z',closesAt:'2026-11-03T09:10:00Z',durationMinutes:5,status:'SCANNING',ocrNumber:null,lastDigit:null,parity:null,evidenceStatus:'รอหลักฐาน',confirmedAt:null,even:{members:12,entries:16,points:3100},odd:{members:9,entries:12,points:2200},deliveries:{LINE:'SENT',EMAIL:'PENDING',WECHAT:'NOT_CONFIGURED'}},
 {id:'1044',date:'2026-11-03',opensAt:'2026-11-03T09:10:00Z',closesAt:'2026-11-03T09:15:00Z',durationMinutes:5,status:'REVIEW_REQUIRED',ocrNumber:null,lastDigit:null,parity:null,evidenceStatus:'รอตรวจสอบ',confirmedAt:null,even:{members:8,entries:10,points:1600},odd:{members:7,entries:9,points:1300},deliveries:{LINE:'RETRY',EMAIL:'PENDING',WECHAT:'NOT_SUPPORTED'}}
];
const daily:DailyView={date:'2026-11-03',totalRounds:3,settledRounds:1,pendingOcrRounds:1,reviewRequiredRounds:1,cancelledRounds:0,uniqueMembers:38,totalEntries:83,totalDemoPoints:14475,evenResults:1,oddResults:0,notificationsSent:3,notificationsFailed:0};
const settings:SettingsView={
 line:{enabled:true,status:'CONNECTED',recipients:[{id:'u1',label:'ผู้ดูแล A',enabled:true,events:['ROUND_CLOSED','ROUND_SETTLED','OCR_REVIEW_REQUIRED','CAMERA_OFFLINE','DAILY_SUMMARY'],lastDelivery:'SENT'},{id:'u2',label:'ผู้ดูแล B',enabled:false,events:['ROUND_SETTLED','DAILY_SUMMARY'],lastDelivery:'PENDING'}]},
 email:{enabled:true,status:'CONNECTED',mode:'BOTH',dailyTime:'18:00',recipients:[{id:'e1',label:'admin@example.invalid',enabled:true,events:['ROUND_SETTLED','DAILY_SUMMARY'],lastDelivery:'SENT'}]},
 wechat:{enabled:false,status:'NOT_SUPPORTED',messageType:'Service message',recipients:[{id:'w1',label:'บัญชี OA ที่ได้รับอนุญาต',enabled:false,events:['DAILY_SUMMARY'],lastDelivery:'NOT_SUPPORTED'}]}
};
document.body.style.margin='0';document.body.style.background='#0b1423';
const target=document.getElementById('root');if(!target)throw Error('missing_root');
createRoot(target).render(location.search.includes('settings')?<NotificationSettings value={settings}/>:<ReportDashboard date="2026-11-03" daily={daily} rounds={rounds} onDateChange={()=>{}} onExportCsv={()=>{}}/>);

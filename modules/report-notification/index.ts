import {createReportService} from './server/report-service';
import {createNotificationService} from './server/notification-service';
import type {ReportReader} from './types';
import type {NotificationServiceConfig} from './server/notification-types';

/** Compose independent report reads and durable notification delivery for a trusted server host. */
export function createReportNotificationModule(config:{reportReader:ReportReader;notifications:NotificationServiceConfig}) {
 if(!config?.reportReader||!config.notifications)throw new Error('report_notification_not_configured');
 const reports=createReportService(config.reportReader);
 const notifications=createNotificationService({...config.notifications,assertRoundSettled:async roundId=>{
  const result=await reports.getRoundReport(roundId);
  if(!result.ok||result.value.status!=='SETTLED'||!result.value.confirmedOcrNumber)return false;
  const round=result.value;
  return {resultNumber:round.confirmedOcrNumber,lastDigit:round.lastDigit,parity:round.result,
   evenMembers:round.even.uniqueMembers,evenEntries:round.even.entries,evenPoints:round.even.demoPoints,
   oddMembers:round.odd.uniqueMembers,oddEntries:round.odd.entries,oddPoints:round.odd.demoPoints,
   evidenceStatus:round.evidenceStatus};
 }});
 return {...reports,...notifications};
}
export {createReportService,dailyCsv,formatRound} from './server/report-service';
export {createNotificationService} from './server/notification-service';
export {createPostgresReportReader,createPostgresNotificationStore} from './server/postgres';
export {createLineAdminAdapter} from './server/line-admin-adapter';
export {createEmailAdapter} from './server/email-adapter';
export {createWeChatAdapter} from './server/wechat-adapter';
export {enqueueDailySummary,dailyDue} from './server/scheduler';
export type * from './types';
export type * from './server/notification-types';

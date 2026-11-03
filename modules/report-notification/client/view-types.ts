export type DeliveryState = 'PENDING'|'PROCESSING'|'SENT'|'RETRY'|'FAILED'|'NOT_CONFIGURED'|'NOT_SUPPORTED';
export type RoundView = {
  id:string; date:string; opensAt:string; closesAt:string; durationMinutes:number;
  status:'OPEN'|'CLOSED'|'SCANNING'|'REVIEW_REQUIRED'|'SETTLED'|'CANCELLED';
  ocrNumber:string|null; lastDigit:number|null; parity:'EVEN'|'ODD'|null;
  evidenceStatus:string; confirmedAt:string|null;
  even:{members:number;entries:number;points:number}; odd:{members:number;entries:number;points:number};
  deliveries?:Partial<Record<'LINE'|'EMAIL'|'WECHAT',DeliveryState>>;
};
export type DailyView = {
  date:string; totalRounds:number; settledRounds:number; pendingOcrRounds:number;
  reviewRequiredRounds:number; cancelledRounds:number; uniqueMembers:number;
  totalEntries:number; totalDemoPoints:number; evenResults:number; oddResults:number;
  notificationsSent:number; notificationsFailed:number;
};
export type ChannelName = 'LINE'|'EMAIL'|'WECHAT';
export type EventName = 'ROUND_CLOSED'|'ROUND_SETTLED'|'OCR_REVIEW_REQUIRED'|'CAMERA_OFFLINE'|'STREAM_OFFLINE'|'WORKER_ERROR'|'DAILY_SUMMARY';
export type RecipientView = {id:string;label:string;enabled:boolean;events:EventName[];lastDelivery?:DeliveryState};
export type ChannelView = {enabled:boolean;status:'CONNECTED'|'NOT_CONFIGURED'|'NOT_SUPPORTED'|'DISCONNECTED';recipients:RecipientView[]};
export type SettingsView = {
  line:ChannelView; email:ChannelView&{mode:'ROUND'|'DAILY'|'BOTH';dailyTime:string};
  wechat:ChannelView&{messageType:string};
};

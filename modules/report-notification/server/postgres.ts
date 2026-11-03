import type {Pool} from 'pg';
import type {ReportReader,RoundSnapshot,EntrySnapshot} from '../types';
import type {NotificationStore,NotificationEvent,Delivery,DeliveryOutcome,NotificationSettings,Recipient} from './notification-types';

type Queryable=Pick<Pool,'query'|'connect'>;
type Row=Record<string,unknown>;
const iso=(value:unknown)=>new Date(value as string|number|Date).toISOString();
const dateOnly=(value:unknown)=>typeof value==='string'?value.slice(0,10):iso(value).slice(0,10);
const round=(row:Row):RoundSnapshot=>({id:String(row.id),opensAt:iso(row.opens_at),closesAt:iso(row.closes_at),durationMinutes:Number(row.duration_minutes),status:row.status as RoundSnapshot['status'],settledAt:row.settled_at?iso(row.settled_at):null,resultNumber:row.status==='SETTLED'&&row.result_number!==null?String(row.result_number):null,evidenceStatus:'NOT_AVAILABLE'});
const event=(row:Row):NotificationEvent=>({eventId:String(row.event_id),type:row.event_type as NotificationEvent['type'],occurredAt:iso(row.occurred_at),...(row.round_id===null?{}:{roundId:String(row.round_id)}),...(row.report_date===null?{}:{date:dateOnly(row.report_date)}),source:'core',payload:row.payload as NotificationEvent['payload']});
const delivery=(row:Row):Delivery=>({id:String(row.id),eventId:String(row.event_id),idempotencyKey:String(row.idempotency_key),channel:row.channel as Delivery['channel'],recipientId:String(row.recipient_id),address:String(row.address),status:row.status as Delivery['status'],attempts:Number(row.attempts),nextAttemptAt:iso(row.next_attempt_at),createdAt:iso(row.created_at),sentAt:row.sent_at?iso(row.sent_at):null,leaseOwner:row.lease_owner?String(row.lease_owner):null,leaseUntil:row.lease_until?iso(row.lease_until):null,lastErrorCode:row.last_error_code?String(row.last_error_code):null,event:event(row)});
const joined=`SELECT o.*,e.event_type,e.occurred_at,e.round_id,e.report_date,e.source,e.payload FROM report_notification_outbox o JOIN report_notification_events e ON e.event_id=o.event_id`;
const safeErrorCode=(value:string|null)=>value===null?null:/^[A-Z0-9_:-]{1,80}$/.test(value)?value:'PROVIDER_ERROR';

/** Inject a private PostgreSQL pool. This adapter never reads credentials or migrates a database. */
export function createPostgresReportReader(pool:Pick<Pool,'query'>):ReportReader {
 if(!pool?.query)throw new Error('report_database_not_configured');
 return {
  async getRound(roundId){if(!/^\d+$/.test(roundId))return null;const r=await pool.query<Row>('SELECT id,opens_at,closes_at,duration_minutes,status,settled_at,result_number FROM rounds WHERE id=$1',[roundId]);return r.rows[0]?round(r.rows[0]):null},
  async listRoundsForBangkokDate(date){const r=await pool.query<Row>("SELECT id,opens_at,closes_at,duration_minutes,status,settled_at,result_number FROM rounds WHERE (opens_at AT TIME ZONE 'Asia/Bangkok')::date=$1::date ORDER BY opens_at,id",[date]);return r.rows.map(round)},
  async getEntries(roundIds){if(roundIds.length===0)return [];if(roundIds.some(id=>!/^\d+$/.test(id)))throw new Error('invalid_round_id');const r=await pool.query<Row>('SELECT round_id,member_id,side,demo_points,status FROM round_entries WHERE round_id=ANY($1::bigint[])',[roundIds]);return r.rows.map((x):EntrySnapshot=>({roundId:String(x.round_id),memberId:String(x.member_id),side:x.side as EntrySnapshot['side'],demoPoints:Number(x.demo_points),status:String(x.status)}))},
  async getDeliveryCounts(date){const r=await pool.query<Row>("SELECT count(*) FILTER (WHERE o.status='SENT')::int AS sent,count(*) FILTER (WHERE o.status='FAILED')::int AS failed FROM report_notification_outbox o JOIN report_notification_events e ON e.event_id=o.event_id WHERE (e.occurred_at AT TIME ZONE 'Asia/Bangkok')::date=$1::date",[date]);return {sent:Number(r.rows[0]?.sent||0),failed:Number(r.rows[0]?.failed||0)}},
 };
}

/** Database-backed outbox: claiming uses SKIP LOCKED, completion uses lease-owner CAS. */
export function createPostgresNotificationStore(pool:Queryable):NotificationStore {
 if(!pool?.query||!pool?.connect)throw new Error('notification_database_not_configured');
 return {
  async registerEvent(value){const r=await pool.query('INSERT INTO report_notification_events(event_id,event_type,occurred_at,round_id,report_date,source,payload) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb) ON CONFLICT(event_id) DO NOTHING RETURNING event_id',[value.eventId,value.type,value.occurredAt,value.roundId??null,value.date??null,value.source,JSON.stringify(value.payload)]);return r.rowCount===1},
  async enqueue(value){const r=await pool.query('INSERT INTO report_notification_outbox(id,event_id,idempotency_key,channel,recipient_id,address,status,attempts,next_attempt_at,created_at,sent_at,lease_owner,lease_until,last_error_code) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT DO NOTHING RETURNING id',[value.id,value.eventId,value.idempotencyKey,value.channel,value.recipientId,value.address,value.status,value.attempts,value.nextAttemptAt,value.createdAt,value.sentAt,value.leaseOwner,value.leaseUntil,safeErrorCode(value.lastErrorCode)]);return r.rowCount===1},
  async claim(now,workerId,leaseMs,limit){
   if(!workerId||!Number.isInteger(leaseMs)||leaseMs<1000||!Number.isInteger(limit)||limit<1||limit>100)throw new Error('invalid_claim');
   const r=await pool.query<Row>(`WITH due AS (
    SELECT id FROM report_notification_outbox
    WHERE ((status IN ('PENDING','RETRY') AND next_attempt_at<=$1::timestamptz)
      OR (status='PROCESSING' AND lease_until<=$1::timestamptz))
    ORDER BY next_attempt_at,created_at,id FOR UPDATE SKIP LOCKED LIMIT $4
   ), claimed AS (
    UPDATE report_notification_outbox o SET status='PROCESSING',lease_owner=$2,lease_until=$1::timestamptz+($3::bigint*interval '1 millisecond'),updated_at=$1::timestamptz
    FROM due WHERE o.id=due.id RETURNING o.*
   ) SELECT c.*,e.event_type,e.occurred_at,e.round_id,e.report_date,e.source,e.payload
     FROM claimed c JOIN report_notification_events e ON e.event_id=c.event_id`,[now,workerId,leaseMs,limit]);
   return r.rows.map(delivery);
  },
  async complete(id,workerId,outcome:DeliveryOutcome){
   const client=await pool.connect();
   try{await client.query('BEGIN');const r=await client.query<Row>(`UPDATE report_notification_outbox SET status=$3,attempts=$4,next_attempt_at=$5,sent_at=$6,
      provider_accepted_at=CASE WHEN $3='SENT' THEN $6 ELSE provider_accepted_at END,
      last_error_code=$7,lease_owner=NULL,lease_until=NULL,updated_at=clock_timestamp()
      WHERE id=$1 AND lease_owner=$2 AND status='PROCESSING' AND lease_until>clock_timestamp()
      RETURNING event_id,channel`,[id,workerId,outcome.status,outcome.attempts,outcome.nextAttemptAt,outcome.sentAt,safeErrorCode(outcome.lastErrorCode)]);
    if(r.rowCount!==1){await client.query('ROLLBACK');return false}
    await client.query('INSERT INTO report_notification_delivery_logs(delivery_id,event_id,channel,status,attempt,error_code,provider_accepted) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,r.rows[0].event_id,r.rows[0].channel,outcome.status,outcome.attempts,safeErrorCode(outcome.lastErrorCode),outcome.status==='SENT']);
    await client.query('COMMIT');return true;
   }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
  },
  async getSettings(){const r=await pool.query<Row>('SELECT enabled,email_frequency,daily_time_bangkok::text,updated_at FROM report_notification_settings WHERE id=1');const s=r.rows[0];if(!s)throw new Error('notification_settings_missing');const x=await pool.query<Row>('SELECT id,channel,address,enabled,events FROM report_notification_recipients ORDER BY id');return {enabled:Boolean(s.enabled),emailFrequency:s.email_frequency as NotificationSettings['emailFrequency'],dailyTimeBangkok:String(s.daily_time_bangkok).slice(0,5),updatedAt:iso(s.updated_at),recipients:x.rows.map((v):Recipient=>({id:String(v.id),channel:v.channel as Recipient['channel'],address:String(v.address),enabled:Boolean(v.enabled),events:v.events as Recipient['events']}))}},
  async updateSettings(settings){const client=await pool.connect();try{await client.query('BEGIN');await client.query('SELECT id FROM report_notification_settings WHERE id=1 FOR UPDATE');await client.query('UPDATE report_notification_settings SET enabled=$1,email_frequency=$2,daily_time_bangkok=$3,updated_at=clock_timestamp(),updated_by=$4 WHERE id=1',[settings.enabled,settings.emailFrequency,settings.dailyTimeBangkok,'module']);await client.query('DELETE FROM report_notification_recipients');for(const r of settings.recipients){await client.query('INSERT INTO report_notification_recipients(id,channel,address,enabled,events,updated_by) VALUES($1,$2,$3,$4,$5,$6)',[r.id,r.channel,r.address,r.enabled,r.events,'module'])}await client.query('COMMIT')}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}return this.getSettings()},
  async getHistory(limit){if(!Number.isInteger(limit)||limit<1||limit>500)throw new Error('invalid_history_limit');const r=await pool.query<Row>(`${joined} ORDER BY o.created_at DESC,o.id DESC LIMIT $1`,[limit]);return r.rows.map(delivery)},
 };
}

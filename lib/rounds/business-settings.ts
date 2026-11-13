import type {PoolClient} from 'pg';
import {database} from '../server/db';
import {RoundError} from './core';
import {settlementRateFromAdminFee} from './admin-fee';

export type ShopHours={open:string;close:string};
export type BusinessSettings={sideDifferenceLimit:number|null;maxRoundPoints:number|null;minRoundPoints:number|null;adminFeeRate:string|null;shopHours:ShopHours|null};
export type BusinessSettingKey=keyof BusinessSettings;
const defaults:BusinessSettings={sideDifferenceLimit:null,maxRoundPoints:null,minRoundPoints:null,adminFeeRate:null,shopHours:null};
const keys:BusinessSettingKey[]=['sideDifferenceLimit','maxRoundPoints','minRoundPoints','adminFeeRate','shopHours'];
const validTime=(value:unknown)=>typeof value==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(value);
function validateSetting(key:BusinessSettingKey,value:unknown){
 if(!keys.includes(key))throw new RoundError('invalid_business_setting');
 if(value===null)return;
 if(key==='sideDifferenceLimit'||key==='maxRoundPoints'||key==='minRoundPoints'){
  if(typeof value!=='number'||!Number.isSafeInteger(value)||value<(key==='sideDifferenceLimit'?0:1))throw new RoundError('invalid_business_setting');
 }else if(key==='adminFeeRate'){
  if(typeof value!=='string')throw new RoundError('invalid_business_setting');
  try{settlementRateFromAdminFee(value)}catch{throw new RoundError('invalid_business_setting')}
 }else if(key==='shopHours'){
  const hours=value as Partial<ShopHours>|null;
  if(!hours||!validTime(hours.open)||!validTime(hours.close)||hours.open===hours.close)throw new RoundError('invalid_business_setting');
 }
}
export async function readBusinessSettings(client:PoolClient):Promise<BusinessSettings>{
 const result=await client.query("SELECT DISTINCT ON (details->>'key') details->>'key' AS key,details->'to' AS value FROM round_audit_logs WHERE action='ROUND_BUSINESS_SETTING_CHANGED' ORDER BY details->>'key',id DESC");
 const settings={...defaults};
 for(const row of result.rows){if(row.key==='sideDifferenceLimit')settings.sideDifferenceLimit=row.value;else if(row.key==='maxRoundPoints')settings.maxRoundPoints=row.value;else if(row.key==='minRoundPoints')settings.minRoundPoints=row.value;else if(row.key==='adminFeeRate')settings.adminFeeRate=row.value;else if(row.key==='shopHours')settings.shopHours=row.value}
 return settings;
}
export async function appliedBusinessSettings(client:PoolClient,roundId:string):Promise<BusinessSettings>{
 const result=await client.query("SELECT details FROM round_audit_logs WHERE round_id=$1 AND action='ROUND_BUSINESS_SETTINGS_APPLIED' ORDER BY id DESC LIMIT 1",[roundId]);
 return result.rows[0]?.details??defaults;
}
export function shopStatusAt(hours:ShopHours|null,utcTime:string|Date):'UNCONFIGURED'|'OPEN'|'CLOSED'{
 if(!hours)return 'UNCONFIGURED';
 const time=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(utcTime));
 return (hours.open<hours.close?time>=hours.open&&time<hours.close:time>=hours.open||time<hours.close)?'OPEN':'CLOSED';
}
export async function updateBusinessSetting(key:BusinessSettingKey,value:unknown){
 validateSetting(key,value);
 const client=await database().connect();
 try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(74021601)');const old=await readBusinessSettings(client);const next={...old,[key]:value} as BusinessSettings;
  if(next.minRoundPoints!==null&&next.maxRoundPoints!==null&&next.minRoundPoints>next.maxRoundPoints)throw new RoundError('invalid_round_total_range');
  if(JSON.stringify(old[key])!==JSON.stringify(value))await client.query("INSERT INTO round_audit_logs(actor,action,details) VALUES('internal','ROUND_BUSINESS_SETTING_CHANGED',jsonb_build_object('key',$1::text,'from',$2::jsonb,'to',$3::jsonb))",[key,JSON.stringify(old[key]),JSON.stringify(value)]);
  await client.query('COMMIT');return next;
 }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
}
export async function businessSettingsOverview(){const client=await database().connect();try{
 await client.query('BEGIN READ ONLY');const settings=await readBusinessSettings(client);
 const active=await client.query("SELECT id,even_points,odd_points FROM rounds WHERE epoch_id=current_round_epoch_id() AND status IN ('OPEN','CLOSED','SCANNING','REVIEW_REQUIRED') ORDER BY id DESC LIMIT 1");
 const row=active.rows[0];const applied=row?await appliedBusinessSettings(client,String(row.id)):null;
 const now=(await client.query('SELECT clock_timestamp() AS now')).rows[0].now as Date;
 await client.query('COMMIT');
 return {settings,shopStatus:shopStatusAt(settings.shopHours,now),currentRound:row?{id:String(row.id),evenPoints:Number(row.even_points),oddPoints:Number(row.odd_points),totalPoints:Number(row.even_points)+Number(row.odd_points),differencePoints:Math.abs(Number(row.even_points)-Number(row.odd_points)),minRoundPoints:applied?.minRoundPoints??null}:null};
 }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}}

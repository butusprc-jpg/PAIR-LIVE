import 'server-only';
import {database} from '../server/db';
import {resolveVdoTenant} from '../../modules/external-live/server/vdo-ninja';

export async function adminOaId(adminId:string){
 const channel=(await database().query<{provider_channel_id:string}>("SELECT provider_channel_id FROM admin_identities WHERE id=$1 AND provider='line' AND status='active'",[adminId])).rows[0]?.provider_channel_id;
 const tenant=await resolveVdoTenant(database(),channel);return tenant.id;
}

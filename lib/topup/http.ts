import {TopupError} from './store';
export const noStore={'Cache-Control':'private, no-store'};
export function topupFailure(e:unknown){return Response.json({error:e instanceof TopupError?e.code:'topup_unavailable'},{status:e instanceof TopupError?e.status:503,headers:noStore})}

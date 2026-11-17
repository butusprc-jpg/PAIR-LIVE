import {t,type Locale} from './i18n';

const statusKeys:Record<string,string>={
 ACTIVE:'status.active',PAUSED:'status.paused',DISABLED:'status.disabled',EXPIRED:'status.expired',
 OPEN:'status.open',CLOSED:'status.closed',SCANNING:'status.scanning',REVIEW_REQUIRED:'status.review',SETTLED:'status.settled',CANCELLED:'status.cancelled',
 PENDING:'status.pending',APPROVED:'status.approved',REJECTED:'status.rejected',TRANSFERRED:'status.transferred',
 NOT_STARTED:'status.notStarted',RUNNING:'status.running',STOPPED:'status.stopped',READY:'status.ready',NOT_CONFIGURED:'status.notConfigured',
 AVAILABLE:'status.available',DELETING:'status.deleting',DELETED:'status.deleted',OK:'status.ok',UNAVAILABLE:'status.unavailable',PARTIAL:'status.partial',
 active:'status.active',disabled:'status.disabled',admin:'status.admin',operator:'status.operator',viewer:'status.viewer',
};

export function adminStatus(value:string|null|undefined,locale:Locale):string{
 if(!value)return t('status.unknown',locale);
 return t(statusKeys[value]??'status.unknown',locale);
}

export function adminError(value:string,locale:Locale):string{
 if(/^[a-z][a-z0-9_]*$/i.test(value))return t('admin.error.generic',locale);
 return t(value,locale);
}

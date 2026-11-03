import type {RoundSummary} from './history';
// Shape accepted by the report module's public ReportReader/notification integration.
// The module stays on its own branch; no queue or CSV implementation is copied here.
export type ReportHandoff={roundId:string;status:RoundSummary['status'];confirmedOcrNumber:string|null;lastDigit:string|null;parity:RoundSummary['parity'];evidenceStatus:RoundSummary['evidenceStatus'];settledAt:string|null;even:RoundSummary['even'];odd:RoundSummary['odd']};
export function reportHandoff(round:RoundSummary):ReportHandoff{return {roundId:round.roundId,status:round.status,confirmedOcrNumber:round.fullDisplayText,lastDigit:round.lastDigit,parity:round.parity,evidenceStatus:round.evidenceStatus,settledAt:round.settledAt,even:round.even,odd:round.odd}}
export type CoreEvent={eventId:string;type:'ROUND_SETTLED'|'OCR_REVIEW_REQUIRED'|'WORKER_ERROR';roundId:string;occurredAt:string;source:'core';payload:ReportHandoff};

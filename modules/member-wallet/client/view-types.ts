export type WalletView={id:string;memberName:string;avatarUrl:string|null;availablePoints:number;reservedPoints:number;status:'ACTIVE'|'FROZEN'|'CLOSED';updatedAt:string};
export type LedgerView={id:string;type:'DEMO_GRANT'|'DEMO_USE'|'DEMO_REFUND'|'DEMO_ADJUSTMENT';points:number;balanceBefore:number;balanceAfter:number;referenceId:string;createdAt:string;status:'POSTED';};

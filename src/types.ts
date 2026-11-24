export interface ERPRecord {
  entityId: string;
  skuCode: string;
  committedQuantity: number;
  unitCost: number;
  currency: string;
  updatedAt: string;
}

export interface CRMRecord {
  entityId: string;
  dealStage: string;
  contractedQuantity: number;
  targetSellingPrice: number;
  discountMargin: number;
  updatedAt: string;
}

export interface Discrepancy {
  field: string;
  erpValue: string | number;
  crmValue: string | number;
  variance: number;
  severity: 'WARNING' | 'CRITICAL';
}

export interface ReconciledTwin {
  entityId: string;
  skuCode: string;
  status: 'IN_SYNC' | 'DIVERGENT' | 'UNMATCHED';
  grossMarginRatio: number;
  discrepancies: Discrepancy[];
  stateHash: string;
  timestamp: string;
}

export interface ActionContext {
  twin: ReconciledTwin;
  logs: string[];
}

export interface WorkflowAction {
  id: string;
  name: string;
  dependencies: string[];
  execute: (ctx: ActionContext) => Promise<{ success: boolean; error?: string }>;
}

export interface ExecutionResult {
  actionId: string;
  success: boolean;
  durationMs: number;
  error?: string;
}

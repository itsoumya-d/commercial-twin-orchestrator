import { createHash } from 'node:crypto';
import type { ERPRecord, CRMRecord, ReconciledTwin, Discrepancy } from './types.ts';

export class EntityReconciler {
  private minMarginThreshold: number;

  constructor(minMarginThreshold: number = 0.20) {
    this.minMarginThreshold = minMarginThreshold;
  }

  public reconcile(erp: ERPRecord, crm: CRMRecord): ReconciledTwin {
    if (erp.entityId !== crm.entityId) {
      throw new Error(`Mismatched entity reconciliation: ${erp.entityId} vs ${crm.entityId}`);
    }

    const discrepancies: Discrepancy[] = [];

    // Quantity reconciliation
    if (erp.committedQuantity !== crm.contractedQuantity) {
      const diff = Math.abs(erp.committedQuantity - crm.contractedQuantity);
      discrepancies.push({
        field: 'quantity',
        erpValue: erp.committedQuantity,
        crmValue: crm.contractedQuantity,
        variance: diff,
        severity: diff > 50 ? 'CRITICAL' : 'WARNING',
      });
    }

    // Margin reconciliation
    const effectivePrice = crm.targetSellingPrice * (1 - crm.discountMargin);
    const grossMargin = effectivePrice - erp.unitCost;
    const grossMarginRatio = effectivePrice > 0 ? Number((grossMargin / effectivePrice).toFixed(4)) : 0;

    if (grossMarginRatio < this.minMarginThreshold) {
      discrepancies.push({
        field: 'grossMarginRatio',
        erpValue: this.minMarginThreshold,
        crmValue: grossMarginRatio,
        variance: Number((this.minMarginThreshold - grossMarginRatio).toFixed(4)),
        severity: 'CRITICAL',
      });
    }

    const status = discrepancies.length === 0 ? 'IN_SYNC' : 'DIVERGENT';

    // Cryptographic state hash for verifiable audit provenance
    const canonicalPayload = JSON.stringify({
      entityId: erp.entityId,
      sku: erp.skuCode,
      qty: { erp: erp.committedQuantity, crm: crm.contractedQuantity },
      margin: grossMarginRatio,
      discrepanciesCount: discrepancies.length,
      status,
    });

    const stateHash = createHash('sha256').update(canonicalPayload).digest('hex');

    return {
      entityId: erp.entityId,
      skuCode: erp.skuCode,
      status,
      grossMarginRatio,
      discrepancies,
      stateHash,
      timestamp: new Date().toISOString(),
    };
  }
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { EntityReconciler } from '../src/reconciler.ts';
import type { ERPRecord, CRMRecord } from '../src/types.ts';

test('EntityReconciler: marks matching records as IN_SYNC with identical state hash', () => {
  const reconciler = new EntityReconciler(0.15);

  const erp: ERPRecord = {
    entityId: 'ORDER-8821',
    skuCode: 'TURBINE-BLADE-X',
    committedQuantity: 100,
    unitCost: 450,
    currency: 'GBP',
    updatedAt: '2026-11-24T10:00:00Z',
  };

  const crm: CRMRecord = {
    entityId: 'ORDER-8821',
    dealStage: 'Closed Won',
    contractedQuantity: 100,
    targetSellingPrice: 600,
    discountMargin: 0.05, // effective price = 570, margin = (570-450)/570 = 21%
    updatedAt: '2026-11-24T10:05:00Z',
  };

  const twin1 = reconciler.reconcile(erp, crm);
  assert.equal(twin1.status, 'IN_SYNC');
  assert.equal(twin1.discrepancies.length, 0);
  assert.ok(twin1.grossMarginRatio > 0.15);
  assert.equal(typeof twin1.stateHash, 'string');
  assert.equal(twin1.stateHash.length, 64);

  // Deterministic hash check
  const twin2 = reconciler.reconcile(erp, crm);
  assert.equal(twin1.stateHash, twin2.stateHash);
});

test('EntityReconciler: detects quantity divergence and critical margin shortfalls', () => {
  const reconciler = new EntityReconciler(0.20);

  const erp: ERPRecord = {
    entityId: 'ORDER-9942',
    skuCode: 'COMPRESSOR-VALVE-V2',
    committedQuantity: 200,
    unitCost: 800,
    currency: 'GBP',
    updatedAt: '2026-11-24T11:00:00Z',
  };

  const crm: CRMRecord = {
    entityId: 'ORDER-9942',
    dealStage: 'Contract Review',
    contractedQuantity: 120, // 80 unit divergence
    targetSellingPrice: 900,
    discountMargin: 0.15, // effective price = 765, below unitCost 800!
    updatedAt: '2026-11-24T11:15:00Z',
  };

  const twin = reconciler.reconcile(erp, crm);
  assert.equal(twin.status, 'DIVERGENT');
  assert.equal(twin.discrepancies.length, 2);

  const qtyDiscrepancy = twin.discrepancies.find((d) => d.field === 'quantity');
  assert.ok(qtyDiscrepancy);
  assert.equal(qtyDiscrepancy?.severity, 'CRITICAL');
  assert.equal(qtyDiscrepancy?.variance, 80);

  const marginDiscrepancy = twin.discrepancies.find((d) => d.field === 'grossMarginRatio');
  assert.ok(marginDiscrepancy);
  assert.equal(marginDiscrepancy?.severity, 'CRITICAL');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkflowPipeline } from '../src/workflow.ts';
import type { ReconciledTwin } from '../src/types.ts';

const dummyTwin: ReconciledTwin = {
  entityId: 'TEST-ENT-1',
  skuCode: 'PART-A',
  status: 'IN_SYNC',
  grossMarginRatio: 0.25,
  discrepancies: [],
  stateHash: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
  timestamp: new Date().toISOString(),
};

test('WorkflowPipeline: resolves DAG dependencies and executes actions in topological sequence', async () => {
  const pipeline = new WorkflowPipeline();
  const executionOrder: string[] = [];

  pipeline
    .register({
      id: 'validate_inventory',
      name: 'Validate ERP Inventory',
      dependencies: [],
      execute: async (ctx) => {
        executionOrder.push('validate_inventory');
        ctx.logs.push('Inventory validated');
        return { success: true };
      },
    })
    .register({
      id: 'reserve_capacity',
      name: 'Reserve Production Line Capacity',
      dependencies: ['validate_inventory'],
      execute: async (ctx) => {
        executionOrder.push('reserve_capacity');
        ctx.logs.push('Capacity reserved');
        return { success: true };
      },
    })
    .register({
      id: 'notify_commercial_exec',
      name: 'Notify Key Account Lead',
      dependencies: ['reserve_capacity'],
      execute: async (ctx) => {
        executionOrder.push('notify_commercial_exec');
        ctx.logs.push('Notification sent');
        return { success: true };
      },
    });

  const res = await pipeline.execute(dummyTwin);
  assert.equal(res.completed, true);
  assert.deepEqual(executionOrder, ['validate_inventory', 'reserve_capacity', 'notify_commercial_exec']);
  assert.equal(res.results.length, 3);
  assert.equal(res.logs.length, 3);
});

test('WorkflowPipeline: rejects cyclic action dependencies with explicit error', () => {
  const pipeline = new WorkflowPipeline();

  pipeline
    .register({
      id: 'action_a',
      name: 'Action A',
      dependencies: ['action_b'],
      execute: async () => ({ success: true }),
    })
    .register({
      id: 'action_b',
      name: 'Action B',
      dependencies: ['action_a'],
      execute: async () => ({ success: true }),
    });

  assert.throws(() => {
    pipeline.getTopologicalOrder();
  }, /Cycle detected in workflow actions/);
});

test('WorkflowPipeline: short-circuits execution gracefully on action failure', async () => {
  const pipeline = new WorkflowPipeline();
  let step2Executed = false;

  pipeline
    .register({
      id: 'step_1',
      name: 'Step 1 - Precondition Check',
      dependencies: [],
      execute: async () => ({ success: false, error: 'Precondition breach' }),
    })
    .register({
      id: 'step_2',
      name: 'Step 2 - Dependent Task',
      dependencies: ['step_1'],
      execute: async () => {
        step2Executed = true;
        return { success: true };
      },
    });

  const res = await pipeline.execute(dummyTwin);
  assert.equal(res.completed, false);
  assert.equal(res.results.length, 1);
  assert.equal(res.results[0].success, false);
  assert.equal(step2Executed, false);
});

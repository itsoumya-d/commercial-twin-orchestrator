import type { WorkflowAction, ReconciledTwin, ActionContext, ExecutionResult } from './types.ts';

export class WorkflowPipeline {
  private actions: Map<string, WorkflowAction> = new Map();

  public register(action: WorkflowAction): this {
    if (this.actions.has(action.id)) {
      throw new Error(`Action with id '${action.id}' is already registered`);
    }
    this.actions.set(action.id, action);
    return this;
  }

  public getTopologicalOrder(): string[] {
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const order: string[] = [];

    const visit = (id: string) => {
      if (visiting.has(id)) {
        throw new Error(`Cycle detected in workflow actions involving '${id}'`);
      }
      if (!visited.has(id)) {
        visiting.add(id);
        const action = this.actions.get(id);
        if (!action) {
          throw new Error(`Missing dependency action '${id}'`);
        }
        for (const dep of action.dependencies) {
          visit(dep);
        }
        visiting.delete(id);
        visited.add(id);
        order.push(id);
      }
    };

    for (const id of this.actions.keys()) {
      if (!visited.has(id)) {
        visit(id);
      }
    }

    return order;
  }

  public async execute(twin: ReconciledTwin): Promise<{
    completed: boolean;
    results: ExecutionResult[];
    logs: string[];
  }> {
    const order = this.getTopologicalOrder();
    const results: ExecutionResult[] = [];
    const ctx: ActionContext = {
      twin,
      logs: [],
    };

    for (const actionId of order) {
      const action = this.actions.get(actionId)!;
      const t0 = performance.now();
      try {
        const res = await action.execute(ctx);
        const durationMs = Number((performance.now() - t0).toFixed(2));
        results.push({
          actionId,
          success: res.success,
          durationMs,
          error: res.error,
        });

        if (!res.success) {
          ctx.logs.push(`Action ${actionId} failed: ${res.error || 'Unknown error'}`);
          return { completed: false, results, logs: ctx.logs };
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        const durationMs = Number((performance.now() - t0).toFixed(2));
        results.push({
          actionId,
          success: false,
          durationMs,
          error: errorMsg,
        });
        ctx.logs.push(`Action ${actionId} threw unhandled exception: ${errorMsg}`);
        return { completed: false, results, logs: ctx.logs };
      }
    }

    return { completed: true, results, logs: ctx.logs };
  }
}

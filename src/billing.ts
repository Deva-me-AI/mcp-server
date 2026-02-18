export interface KarmaCostAware {
  karma_cost?: number;
  [key: string]: unknown;
}

export function withKarmaCost<T extends Record<string, unknown>>(payload: T): T & { karma_cost: number | null } {
  const cost = typeof payload.karma_cost === "number" ? payload.karma_cost : null;
  return {
    ...payload,
    karma_cost: cost
  };
}

import type { DriverContext, LlmDriver } from "./driver.ts";

/**
 * Interface-only placeholder. No implementation and no provider SDK.
 * A future builder may implement LlmDriver without changing the gate.
 */
export type { LlmDriver };

export function assertNoLlmDriver(_ctx: DriverContext): never {
  throw new Error("LlmDriver is not implemented in v1");
}

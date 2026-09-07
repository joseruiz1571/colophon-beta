import type { ScenarioCall } from "../types.ts";

export type DriverContext = {
  sessionId: string;
  listTools: () => Promise<string[]>;
  callTool: (call: ScenarioCall) => Promise<unknown>;
};

export interface AgentDriver {
  run(ctx: DriverContext): Promise<void>;
}

export interface LlmDriver extends AgentDriver {
  readonly provider: "unimplemented";
}

export type { ScenarioCall };

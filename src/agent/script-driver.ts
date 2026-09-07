import type { Scenario } from "../types.ts";
import type { AgentDriver, DriverContext } from "./driver.ts";

export class ScriptDriver implements AgentDriver {
  constructor(private readonly scenario: Scenario) {}

  async run(ctx: DriverContext): Promise<void> {
    for (const call of this.scenario.calls) {
      await ctx.callTool(call);
    }
  }
}

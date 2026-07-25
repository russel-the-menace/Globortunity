import { describe, expect, it } from "vitest";
import { BossCollector } from "./collectors.js";

describe("BossCollector policy gate", () => {
  it("does not make requests when disabled", async () => {
    const result = await new BossCollector({ enabled: false, authorized: false }).collect();
    expect(result).toMatchObject({ status: "skipped", pagesRequested: 0, jobs: [] });
  });

  it("does not implement access merely because flags are enabled", async () => {
    const result = await new BossCollector({ enabled: true, authorized: true }).collect();
    expect(result.status).toBe("skipped");
    expect(result.reason).toContain("No permitted BOSS transport");
  });
});

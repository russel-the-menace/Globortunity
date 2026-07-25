import { describe, expect, it } from "vitest";
import { parseCollectorInterval } from "./config.js";

describe("collector interval configuration", () => {
  it("uses a safe default for invalid values", () => {
    expect(parseCollectorInterval("not-a-number")).toBe(900_000);
    expect(parseCollectorInterval(undefined)).toBe(900_000);
  });

  it("clamps values to the supported timer range", () => {
    expect(parseCollectorInterval("1")).toBe(60_000);
    expect(parseCollectorInterval("999999999999")).toBe(2_147_483_647);
  });
});

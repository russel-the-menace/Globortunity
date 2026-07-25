import { describe, expect, it } from "vitest";
import { companyInitials, formatSalary } from "./format";
import type { Job } from "./types";

describe("web formatters", () => {
  it("creates compact company initials", () => {
    expect(companyInitials("Northstar Labs")).toBe("NL");
  });

  it("prefers the salary representation supplied by the source", () => {
    const job = { salary: { text: "CNY 35K-50K / month" } } as Job;
    expect(formatSalary(job)).toBe("CNY 35K-50K / month");
  });
});

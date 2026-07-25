import { describe, expect, it } from "vitest";
import { classifyRemote, createJobFingerprint, normalizeKey, parseSalary } from "./index.js";

describe("domain normalization", () => {
  it("normalizes compatibility characters and punctuation", () => {
    expect(normalizeKey("  Senior（Remote） Engineer ")).toBe("senior remote engineer");
  });

  it("gives explicit onsite language precedence over remote keywords", () => {
    expect(classifyRemote("Remote team, but this role is on-site").scope).toBe("onsite");
    expect(classifyRemote("The team is remote, but this role is not remote").scope).toBe("onsite");
    expect(classifyRemote("远程团队，但该岗位不接受远程").scope).toBe("onsite");
  });

  it("classifies remote and hybrid arrangements", () => {
    expect(classifyRemote("全远程，可居家办公").scope).toBe("remote");
    expect(classifyRemote("This role is not on-site").scope).toBe("remote");
    expect(classifyRemote("Hybrid schedule / 混合办公").scope).toBe("hybrid");
  });

  it("parses common monthly and annual salary formats", () => {
    expect(parseSalary("20-30K·13薪")).toMatchObject({ min: 20_000, max: 30_000, currency: "CNY", period: "month" });
    expect(parseSalary("$120k-$160k/year")).toMatchObject({ min: 120_000, max: 160_000, currency: "USD", period: "year" });
  });

  it("creates stable fingerprints for cosmetic text changes", () => {
    const base = {
      title: "Staff Engineer",
      companyName: "Example, Inc.",
      location: "Shanghai",
      remoteScope: "remote" as const,
      description: "Build reliable systems.",
    };
    expect(createJobFingerprint(base)).toBe(
      createJobFingerprint({ ...base, companyName: "Example Inc", description: " Build reliable  systems. " }),
    );
  });
});

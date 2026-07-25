import type { NormalizedJobInput } from "@globortunity/domain";

export interface CollectionResult {
  status: "succeeded" | "skipped";
  pagesRequested: number;
  jobs: NormalizedJobInput[];
  reason?: string;
}

export interface Collector {
  readonly source: {
    id: string;
    label: string;
    baseUrl: string | null;
    enabled: boolean;
    policyStatus: "pending" | "approved" | "paused" | "blocked";
  };
  collect(): Promise<CollectionResult>;
}

export class BossCollector implements Collector {
  readonly source;
  private readonly authorized: boolean;

  constructor(options: { enabled: boolean; authorized: boolean }) {
    this.authorized = options.authorized;
    this.source = {
      id: "boss-zhipin",
      label: "BOSS Zhipin",
      baseUrl: "https://www.zhipin.com",
      enabled: options.enabled,
      policyStatus: options.authorized ? ("paused" as const) : ("pending" as const),
    };
  }

  async collect(): Promise<CollectionResult> {
    if (!this.source.enabled) {
      return { status: "skipped", pagesRequested: 0, jobs: [], reason: "Source disabled" };
    }
    if (!this.authorized) {
      return {
        status: "skipped",
        pagesRequested: 0,
        jobs: [],
        reason: "Authorized BOSS access has not been confirmed",
      };
    }
    return {
      status: "skipped",
      pagesRequested: 0,
      jobs: [],
      reason: "No permitted BOSS transport is configured; see docs/boss-source-plan.md",
    };
  }
}

export class StaticCollector implements Collector {
  readonly source = {
    id: "demo",
    label: "Demo feed",
    baseUrl: "https://example.com",
    enabled: true,
    policyStatus: "approved" as const,
  };

  constructor(private readonly jobs: NormalizedJobInput[]) {}

  async collect(): Promise<CollectionResult> {
    return { status: "succeeded", pagesRequested: 0, jobs: this.jobs };
  }
}

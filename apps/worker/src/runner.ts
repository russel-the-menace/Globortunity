import {
  ensureSource,
  finishCrawlRun,
  startCrawlRun,
  upsertJob,
  type Database,
} from "@globortunity/database";
import type { Collector } from "./collectors.js";

function log(level: "info" | "error", message: string, fields: Record<string, unknown> = {}): void {
  process.stdout.write(`${JSON.stringify({ level, message, ...fields, time: new Date().toISOString() })}\n`);
}

export async function runCollector(sql: Database, collector: Collector): Promise<void> {
  const sourceState = await ensureSource(sql, collector.source);
  const runId = await startCrawlRun(sql, collector.source.id);
  if (!sourceState.enabled || sourceState.policyStatus !== "approved") {
    const reason = !sourceState.enabled ? "Source disabled" : `Source policy is ${sourceState.policyStatus}`;
    await finishCrawlRun(sql, runId, {
      status: "skipped",
      pagesRequested: 0,
      jobsSeen: 0,
      jobsCreated: 0,
      errorSummary: reason,
    });
    log("info", "Collector run skipped", { source: collector.source.id, reason });
    return;
  }

  let pagesRequested = 0;
  let jobsSeen = 0;
  let jobsCreated = 0;

  try {
    const result = await collector.collect();
    pagesRequested = result.pagesRequested;
    jobsSeen = result.jobs.length;
    for (const job of result.jobs) {
      const stored = await upsertJob(sql, job);
      if (stored.created) jobsCreated += 1;
    }
    await finishCrawlRun(sql, runId, {
      status: result.status,
      pagesRequested,
      jobsSeen,
      jobsCreated,
      ...(result.reason ? { errorSummary: result.reason } : {}),
    });
    log("info", "Collector run finished", {
      source: collector.source.id,
      status: result.status,
      jobsSeen,
      jobsCreated,
      reason: result.reason,
    });
  } catch (error) {
    const summary = error instanceof Error ? error.message : "Unknown collector error";
    await finishCrawlRun(sql, runId, {
      status: "failed",
      pagesRequested,
      jobsSeen,
      jobsCreated,
      errorSummary: summary.slice(0, 500),
    });
    log("error", "Collector run failed", { source: collector.source.id, error: summary });
  }
}

export async function runAllCollectors(sql: Database, collectors: Collector[]): Promise<void> {
  // Sequential execution is deliberate on the current low-memory server.
  for (const collector of collectors) await runCollector(sql, collector);
}

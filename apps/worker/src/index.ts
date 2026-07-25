import { connectDatabase } from "@globortunity/database";
import { demoJobs } from "@globortunity/database/demo-data";
import { BossCollector, StaticCollector, type Collector } from "./collectors.js";
import { parseCollectorInterval } from "./config.js";
import { runAllCollectors } from "./runner.js";

const enabled = (value: string | undefined, fallback = false) =>
  value === undefined ? fallback : value.toLocaleLowerCase("en-US") === "true";

const collectors: Collector[] = [];
if (enabled(process.env.DEMO_SOURCE_ENABLED, true)) collectors.push(new StaticCollector(demoJobs));
const liveCollectionEnabled = enabled(process.env.CRAWLING_ENABLED);
collectors.push(
  new BossCollector({
    enabled: liveCollectionEnabled && enabled(process.env.BOSS_SOURCE_ENABLED),
    authorized: enabled(process.env.BOSS_AUTHORIZED_ACCESS),
  }),
);

const sql = connectDatabase();
let shuttingDown = false;
let collecting = false;

async function collect(): Promise<void> {
  if (collecting || shuttingDown) return;
  collecting = true;
  try {
    await runAllCollectors(sql, collectors);
  } finally {
    collecting = false;
  }
}

async function shutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  await sql.end({ timeout: 5 });
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

await collect();
if (process.argv.includes("--once")) {
  await sql.end();
  process.exit(0);
}

const intervalMs = parseCollectorInterval(process.env.COLLECTOR_INTERVAL_MS);
setInterval(() => void collect(), intervalMs);

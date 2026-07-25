import { connectDatabase, ensureSource, upsertJob } from "./index.js";
import { demoJobs } from "./demo-data.js";

const sql = connectDatabase();
try {
  await ensureSource(sql, {
    id: "demo",
    label: "Demo feed",
    baseUrl: "https://example.com",
    enabled: true,
    policyStatus: "approved",
  });
  for (const job of demoJobs) await upsertJob(sql, job);
  process.stdout.write(`Seeded ${demoJobs.length} demo jobs\n`);
} finally {
  await sql.end();
}

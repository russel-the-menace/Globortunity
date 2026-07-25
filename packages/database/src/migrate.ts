import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { connectDatabase } from "./index.js";

const migrationDirectory = fileURLToPath(new URL("../../../infra/migrations/", import.meta.url));
const sql = connectDatabase();

try {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  const files = (await readdir(migrationDirectory)).filter((name) => name.endsWith(".sql")).sort();
  for (const filename of files) {
    const applied = await sql`SELECT 1 FROM schema_migrations WHERE filename = ${filename}`;
    if (applied.length > 0) continue;
    const contents = await readFile(`${migrationDirectory}/${filename}`, "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(contents);
      await tx`INSERT INTO schema_migrations (filename) VALUES (${filename})`;
    });
    process.stdout.write(`Applied migration ${filename}\n`);
  }
} finally {
  await sql.end();
}

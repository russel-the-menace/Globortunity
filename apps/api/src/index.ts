import { connectDatabase } from "@globortunity/database";
import { buildApp } from "./app.js";

const sql = connectDatabase();
const app = await buildApp(sql);
const port = Number(process.env.API_PORT ?? 3000);

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "Shutting down");
  await app.close();
  await sql.end({ timeout: 5 });
  process.exit(0);
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

try {
  await app.listen({ port, host: "0.0.0.0" });
} catch (error) {
  app.log.error(error);
  await sql.end();
  process.exit(1);
}

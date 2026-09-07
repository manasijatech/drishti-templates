import { connectMongoose } from "@order-win/database";
import { createApp } from "./app";
import { loadConfig } from "./config";

const config = loadConfig();
const mongooseConnection = await connectMongoose(config.MONGODB_URI);
const app = createApp({
  config,
  mongooseConnection,
});

const server = Bun.serve({ hostname: config.API_HOST, port: config.API_PORT, fetch: app.fetch });
console.info(`Order Win Tracker API listening on ${server.url}`);

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  server.stop(false);
  await mongooseConnection.close();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { StateStore } from "./state-store.js";
import { EztorClient } from "./eztor-client.js";
import { runBot } from "./bot.js";
import { startScheduler } from "./scheduler.js";
import { AlertService, isTokenInvalidError } from "./alert-service.js";

async function executeRun({ client, config, logger, alertService, reason, rethrowErrors }) {
  try {
    const result = await runBot({
      client,
      config,
      logger,
      reason
    });
    await alertService.recordHealthyToken({
      token: client.token,
      reason
    });
    await alertService.clearInvalidTokenAlert();
    return result;
  } catch (error) {
    logger.error("Booking scan failed.", {
      reason,
      error: error.message
    });

    if (isTokenInvalidError(error)) {
      await alertService.notifyInvalidToken({
        token: client.token,
        error,
        reason
      });
    }

    if (rethrowErrors) {
      throw error;
    }

    return null;
  }
}

async function main() {
  const config = await loadConfig(process.cwd());
  process.env.TZ = config.timezone;

  const logger = createLogger(config.logLevel);
  const stateStore = new StateStore(config.stateFile);
  const client = new EztorClient({ config, stateStore, logger });
  const alertService = new AlertService({ config, stateStore, logger });
  await client.initialize();

  const once = process.argv.includes("--once");

  if (once) {
    await executeRun({
      client,
      config,
      logger,
      alertService,
      reason: "manual-once",
      rethrowErrors: true
    });
    return;
  }

  const scheduler = startScheduler({
    config,
    logger,
    onTick: async (reason) =>
      executeRun({
        client,
        config,
        logger,
        alertService,
        reason,
        rethrowErrors: false
      })
  });

  process.on("SIGINT", () => {
    logger.info("Stopping scheduler.");
    scheduler.stop();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    logger.info("Stopping scheduler.");
    scheduler.stop();
    process.exit(0);
  });

  await scheduler.start();
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});

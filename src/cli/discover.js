import { loadConfig } from "../config.js";
import { createLogger } from "../logger.js";
import { StateStore } from "../state-store.js";
import { EztorClient } from "../eztor-client.js";
import { resolveDiscovery } from "../discovery.js";

async function main() {
  const config = await loadConfig(process.cwd());
  process.env.TZ = config.timezone;

  const logger = createLogger(config.logLevel);
  const stateStore = new StateStore(config.stateFile);
  const client = new EztorClient({ config, stateStore, logger });
  await client.initialize();

  const result = await resolveDiscovery({ client, config, logger });

  logger.info("Discovery summary written.", { file: config.discoveryFile });
  logger.info("Public employees", {
    employees: result.discovery.publicEmployees.map((employee) => employee.name)
  });
  logger.info("Employee roster", {
    roster: result.discovery.employeeRoster.map((employee) => ({
      name: employee.name,
      id: employee.id,
      inferredRole: employee.inferredRole,
      publicBookable: employee.publicBookable,
      publicTreatments: employee.publicTreatments
    }))
  });
  logger.info("Barbers extracted from app metadata", {
    barbers: result.discovery.barberRoster.map((employee) => ({
      name: employee.name,
      id: employee.id,
      publicBookable: employee.publicBookable,
      publicTreatments: employee.publicTreatments
    }))
  });

  if (result.discovery.targetTemplateSummary) {
    logger.info("Matched target template.", result.discovery.targetTemplateSummary);
  } else {
    logger.warn("Target template was not found.");
  }

  if (result.discovery.blockers.length > 0) {
    logger.warn("Discovery blockers", { blockers: result.discovery.blockers });
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});

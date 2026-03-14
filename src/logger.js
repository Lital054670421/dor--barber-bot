const LEVELS = ["debug", "info", "warn", "error"];

function write(level, message, meta) {
  const timestamp = new Date().toISOString();
  const suffix = meta === undefined ? "" : ` ${JSON.stringify(meta)}`;
  process.stdout.write(`[${timestamp}] ${level.toUpperCase()} ${message}${suffix}\n`);
}

export function createLogger(level = "info") {
  const minimumIndex = LEVELS.indexOf(level);

  function canWrite(candidate) {
    const candidateIndex = LEVELS.indexOf(candidate);
    return candidateIndex >= minimumIndex;
  }

  return {
    debug(message, meta) {
      if (canWrite("debug")) {
        write("debug", message, meta);
      }
    },
    info(message, meta) {
      if (canWrite("info")) {
        write("info", message, meta);
      }
    },
    warn(message, meta) {
      if (canWrite("warn")) {
        write("warn", message, meta);
      }
    },
    error(message, meta) {
      if (canWrite("error")) {
        write("error", message, meta);
      }
    }
  };
}

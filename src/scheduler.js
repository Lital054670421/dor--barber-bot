function millisecondsUntilNextMinute(now) {
  const next = new Date(now.getTime());
  next.setSeconds(0, 0);
  next.setMinutes(next.getMinutes() + 1);
  return next.getTime() - now.getTime();
}

function millisecondsUntilNextInterval(now, intervalMinutes) {
  const next = new Date(now.getTime());
  next.setSeconds(0, 0);
  const remainder = next.getMinutes() % intervalMinutes;
  const deltaMinutes = remainder === 0 ? intervalMinutes : intervalMinutes - remainder;
  next.setMinutes(next.getMinutes() + deltaMinutes);
  return next.getTime() - now.getTime();
}

function delayForNextRun(now, config) {
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  if (currentHour === 0 && currentMinute < config.midnightBurstMinutes) {
    return millisecondsUntilNextMinute(now);
  }

  return millisecondsUntilNextInterval(now, config.scanIntervalMinutes);
}

export function startScheduler({ config, logger, onTick }) {
  let stopped = false;
  let timer = null;
  let running = false;

  async function execute(reason) {
    if (running) {
      logger.warn("Skipping overlapping scheduler tick.", { reason });
      return;
    }

    running = true;

    try {
      await onTick(reason);
    } finally {
      running = false;
    }
  }

  function scheduleNext() {
    if (stopped) {
      return;
    }

    const now = new Date();
    const delay = delayForNextRun(now, config);
    logger.info("Scheduled next scan.", { delayMs: delay });
    timer = setTimeout(async () => {
      await execute("scheduled");
      scheduleNext();
    }, delay);
  }

  return {
    async start() {
      await execute("startup");
      scheduleNext();
    },
    stop() {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
      }
    }
  };
}

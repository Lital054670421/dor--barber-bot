const WEEKDAY_MAP = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6
};

function getFormatter(timeZone, options) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    ...options
  });
}

export function getZonedParts(date, timeZone) {
  const formatter = getFormatter(timeZone, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    weekday: "short"
  });

  const parts = formatter.formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(byType.year),
    month: Number(byType.month),
    day: Number(byType.day),
    hour: Number(byType.hour),
    minute: Number(byType.minute),
    second: Number(byType.second),
    weekday: WEEKDAY_MAP[byType.weekday]
  };
}

export function formatDateTime(date, timeZone) {
  return getFormatter(timeZone, {
    dateStyle: "medium",
    timeStyle: "short",
    hourCycle: "h23"
  }).format(date);
}

export function formatShortDate(date, timeZone) {
  return getFormatter(timeZone, {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit"
  }).format(date);
}

export function formatHourMinute(date, timeZone) {
  return getFormatter(timeZone, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).format(date);
}

export function zonedWeekKey(date, timeZone) {
  const parts = getZonedParts(date, timeZone);
  const anchor = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  anchor.setUTCDate(anchor.getUTCDate() - parts.weekday);
  return anchor.toISOString().slice(0, 10);
}

export function minutesSinceMidnight(date, timeZone) {
  const parts = getZonedParts(date, timeZone);
  return (parts.hour * 60) + parts.minute;
}

export function differenceInWholeDays(fromDate, toDate) {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return Math.round((toDate.getTime() - fromDate.getTime()) / millisecondsPerDay);
}

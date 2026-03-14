import {
  differenceInWholeDays,
  formatDateTime,
  getZonedParts,
  minutesSinceMidnight,
  zonedWeekKey
} from "./time.js";

function slotBand(parts, config) {
  const exactTarget =
    parts.weekday === config.desiredWeekday &&
    parts.hour === config.desiredHour &&
    parts.minute === config.desiredMinute;

  if (exactTarget) {
    return 0;
  }

  if (parts.weekday === config.desiredWeekday && parts.hour >= config.fallbackAfterHour) {
    return 1;
  }

  if (parts.hour >= config.fallbackAfterHour) {
    return 2;
  }

  return 3;
}

function gapPenalty(date, existingOrders) {
  if (existingOrders.length === 0) {
    return 0;
  }

  let best = Number.POSITIVE_INFINITY;

  for (const order of existingOrders) {
    const orderDate = new Date(order.DateAndHour);
    const penalty = Math.abs(differenceInWholeDays(orderDate, date) - 7);
    best = Math.min(best, penalty);
  }

  return best;
}

function compareArrays(left, right) {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;

    if (leftValue < rightValue) {
      return -1;
    }

    if (leftValue > rightValue) {
      return 1;
    }
  }

  return 0;
}

function slotScore(entry, existingOrders, config) {
  const desiredTimeInMinutes = (config.desiredHour * 60) + config.desiredMinute;

  return [
    slotBand(entry.parts, config),
    Math.abs(minutesSinceMidnight(entry.date, config.timezone) - desiredTimeInMinutes),
    gapPenalty(entry.date, existingOrders),
    entry.date.getTime()
  ];
}

export function findAppointmentThisWeek(orders, config, now = new Date()) {
  const currentWeekKey = zonedWeekKey(now, config.timezone);

  return orders.find((order) => zonedWeekKey(new Date(order.DateAndHour), config.timezone) === currentWeekKey) ?? null;
}

export function pickBestSlot({ slots, existingOrders, config, now = new Date() }) {
  const normalizedSlots = slots
    .map((slot) => ({
      slot,
      date: new Date(slot.DateAndHour),
      parts: getZonedParts(new Date(slot.DateAndHour), config.timezone)
    }))
    .filter((entry) => entry.date.getTime() > now.getTime());

  if (normalizedSlots.length === 0) {
    return null;
  }

  const bookedWeekKeys = new Set(
    existingOrders.map((order) => zonedWeekKey(new Date(order.DateAndHour), config.timezone))
  );

  const slotsByWeek = new Map();

  for (const entry of normalizedSlots) {
    const weekKey = zonedWeekKey(entry.date, config.timezone);

    if (bookedWeekKeys.has(weekKey)) {
      continue;
    }

    if (!slotsByWeek.has(weekKey)) {
      slotsByWeek.set(weekKey, []);
    }

    slotsByWeek.get(weekKey).push(entry);
  }

  const weekCandidates = [...slotsByWeek.entries()].map(([weekKey, entries]) => {
    const sortedEntries = [...entries].sort((left, right) =>
      compareArrays(slotScore(left, existingOrders, config), slotScore(right, existingOrders, config))
    );
    const bestEntry = sortedEntries[0];
    const leadDays = differenceInWholeDays(now, bestEntry.date);

    return {
      weekKey,
      bestEntry,
      leadDays,
      weekScore: [
        Math.abs(leadDays - config.targetLeadDays),
        -leadDays,
        ...slotScore(bestEntry, existingOrders, config)
      ]
    };
  });

  if (weekCandidates.length === 0) {
    return null;
  }

  weekCandidates.sort((left, right) => compareArrays(left.weekScore, right.weekScore));

  const selectedWeek = weekCandidates[0];
  const filteredSlots = slotsByWeek.get(selectedWeek.weekKey).filter(
    (entry) => zonedWeekKey(entry.date, config.timezone) === selectedWeek.weekKey
  );

  filteredSlots.sort((left, right) => {
    return compareArrays(slotScore(left, existingOrders, config), slotScore(right, existingOrders, config));
  });

  return {
    ...filteredSlots[0].slot,
    _debug: {
      chosenWeek: selectedWeek.weekKey,
      localDateTime: formatDateTime(filteredSlots[0].date, config.timezone),
      targetLeadDays: config.targetLeadDays,
      selectedLeadDays: selectedWeek.leadDays
    }
  };
}

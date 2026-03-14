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

  const candidateWeekKeys = [...new Set(normalizedSlots.map((entry) => zonedWeekKey(entry.date, config.timezone)))];
  const targetWeekKey = candidateWeekKeys.find((weekKey) => !bookedWeekKeys.has(weekKey));

  if (!targetWeekKey) {
    return null;
  }

  const filteredSlots = normalizedSlots.filter(
    (entry) => zonedWeekKey(entry.date, config.timezone) === targetWeekKey
  );

  const desiredTimeInMinutes = (config.desiredHour * 60) + config.desiredMinute;

  filteredSlots.sort((left, right) => {
    const leftScore = [
      slotBand(left.parts, config),
      Math.abs(minutesSinceMidnight(left.date, config.timezone) - desiredTimeInMinutes),
      gapPenalty(left.date, existingOrders),
      left.date.getTime()
    ];

    const rightScore = [
      slotBand(right.parts, config),
      Math.abs(minutesSinceMidnight(right.date, config.timezone) - desiredTimeInMinutes),
      gapPenalty(right.date, existingOrders),
      right.date.getTime()
    ];

    return compareArrays(leftScore, rightScore);
  });

  return {
    ...filteredSlots[0].slot,
    _debug: {
      chosenWeek: targetWeekKey,
      localDateTime: formatDateTime(filteredSlots[0].date, config.timezone)
    }
  };
}

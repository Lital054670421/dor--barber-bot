import { pickBestSlot, findAppointmentThisWeek } from "./booking-policy.js";
import { formatDateTime, formatHourMinute, formatShortDate } from "./time.js";
import { resolveDiscovery } from "./discovery.js";

const NOTIFICATION_HEADER = "\u05d4\u05d6\u05de\u05e0\u05ea \u05ea\u05d5\u05e8";
const SYSTEM_SENDER = "\u05d4\u05d5\u05d3\u05e2\u05ea \u05de\u05e2\u05e8\u05db\u05ea";

function requireValue(value, message) {
  if (!value) {
    throw new Error(message);
  }

  return value;
}

function summarizeSlotPayload(payload) {
  if (Array.isArray(payload)) {
    return { kind: "array", length: payload.length };
  }

  if (payload && typeof payload === "object") {
    return {
      kind: "object",
      message: payload.message ?? "",
      keys: Object.keys(payload).slice(0, 8)
    };
  }

  return {
    kind: typeof payload,
    value: String(payload ?? "")
  };
}

async function loadAvailableSlots({ client, orderTemplate, logger }) {
  const attempts = [
    { name: "getListAvailableTorim", fn: () => client.getListAvailableTorim(orderTemplate) },
    { name: "getTheClosestTorim", fn: () => client.getTheClosestTorim([orderTemplate]) }
  ];

  for (const attempt of attempts) {
    try {
      const payload = await attempt.fn();

      if (Array.isArray(payload)) {
        return payload;
      }

      logger.warn("Slot lookup did not return an array.", {
        endpoint: attempt.name,
        payload: summarizeSlotPayload(payload)
      });
    } catch (error) {
      logger.warn("Slot lookup failed.", {
        endpoint: attempt.name,
        error: error.message
      });
    }
  }

  return [];
}

function buildNotification({ user, template, slot, config }) {
  const firstName = user.FName || "";
  const employeeName = template.Employye.Name || "";
  const treatmentName = template.Treatment.Name || "";
  const dateText = formatShortDate(new Date(slot.DateAndHour), config.timezone);
  const timeText = slot.DateAndHourString || formatHourMinute(new Date(slot.DateAndHour), config.timezone);

  return {
    Header: NOTIFICATION_HEADER,
    Message:
      `\u05d4\u05d9\u05d9 ${firstName}, ` +
      `\u05d4\u05ea\u05d5\u05e8 \u05dc${treatmentName} ` +
      `\u05d0\u05e6\u05dc ${employeeName} ` +
      `\u05d1\u05ea\u05d0\u05e8\u05d9\u05da ${dateText}, ` +
      `\u05d1\u05e9\u05e2\u05d4 ${timeText} ` +
      `\u05e0\u05e7\u05d1\u05e2 \u05d1\u05d4\u05e6\u05dc\u05d7\u05d4!`,
    sentBy: SYSTEM_SENDER,
    oneSignalAppId: ""
  };
}

function buildUpdateMessage({ user, template, slot, config }) {
  const fullName = [user.FName, user.LName].filter(Boolean).join(" ").trim();
  const employeeName = template.Employye.Name || "";
  const treatmentName = template.Treatment.Name || "";
  const dateText = formatShortDate(new Date(slot.DateAndHour), config.timezone);
  const timeText = slot.DateAndHourString || formatHourMinute(new Date(slot.DateAndHour), config.timezone);

  return (
    `${fullName}, ` +
    `\u05d4\u05d6\u05de\u05d9\u05df \u05ea\u05d5\u05e8 ` +
    `\u05dc${treatmentName} ` +
    `\u05d0\u05e6\u05dc ${employeeName} ` +
    `\u05d1\u05ea\u05d0\u05e8\u05d9\u05da ${dateText}, ` +
    `\u05d1\u05e9\u05e2\u05d4 ${timeText}`
  );
}

function summarizeSlotForOutput(slot, config) {
  return {
    slotUtc: slot.DateAndHour,
    slotLocal: formatDateTime(new Date(slot.DateAndHour), config.timezone),
    timeString: slot.DateAndHourString || formatHourMinute(new Date(slot.DateAndHour), config.timezone)
  };
}

function matchesTargetTemplate(order, orderTemplate) {
  if (!order || !orderTemplate) {
    return false;
  }

  const orderEmployeeId = order.Employye?._id ?? "";
  const orderEmployeeName = order.Employye?.Name ?? "";
  const orderTreatmentId = order.Treatment?._id ?? "";
  const orderTreatmentName = order.Treatment?.Name ?? "";

  const targetEmployeeId = orderTemplate.Employye?._id ?? "";
  const targetEmployeeName = orderTemplate.Employye?.Name ?? "";
  const targetTreatmentId = orderTemplate.Treatment?._id ?? "";
  const targetTreatmentName = orderTemplate.Treatment?.Name ?? "";

  const employeeMatches =
    (targetEmployeeId && orderEmployeeId === targetEmployeeId) ||
    (targetEmployeeName && orderEmployeeName === targetEmployeeName);
  const treatmentMatches =
    (targetTreatmentId && orderTreatmentId === targetTreatmentId) ||
    (targetTreatmentName && orderTreatmentName === targetTreatmentName);

  return employeeMatches && treatmentMatches;
}

export async function runBot({ client, config, logger, reason }) {
  logger.info("Starting booking scan.", { reason });

  const discovered = await resolveDiscovery({ client, config, logger });
  const blockers = [];
  const effectiveUserId = config.userId || discovered.resolvedUserId || discovered.userProfile?._id || "";

  if (!effectiveUserId) {
    blockers.push("EZTOR_USER_ID is required, unless the user profile file can supply a valid _id.");
  }

  if (!discovered.userProfile) {
    blockers.push(
      "A full user profile object is required. Put it in the file from EZTOR_USER_PROFILE_FILE or make sure getTablesOrder can return it."
    );
  }

  if (!discovered.orderTemplate) {
    blockers.push(
      "A matching order template is required. Put it in EZTOR_ORDER_TEMPLATE_FILE or make sure discovery can find the target employee and treatment."
    );
  }

  blockers.push(...discovered.discovery.blockers);

  if (blockers.length > 0) {
    throw new Error([...new Set(blockers)].join(" "));
  }

  const userProfile = requireValue(discovered.userProfile, "User profile is missing.");
  const orderTemplate = requireValue(discovered.orderTemplate, "Order template is missing.");
  const allOrders = discovered.orders ?? [];
  const existingOrders = allOrders.filter((order) => matchesTargetTemplate(order, orderTemplate));

  if (allOrders.length !== existingOrders.length) {
    logger.info("Ignoring unrelated future appointments for coverage calculations.", {
      kept: existingOrders.length,
      ignored: allOrders.length - existingOrders.length,
      targetEmployeeName: orderTemplate.Employye?.Name,
      targetTreatmentName: orderTemplate.Treatment?.Name
    });
  }

  const appointmentThisWeek = findAppointmentThisWeek(existingOrders, config);

  if (appointmentThisWeek) {
    logger.info("Current week is already covered. Looking for the next uncovered week.", {
      appointment: formatDateTime(new Date(appointmentThisWeek.DateAndHour), config.timezone)
    });
  }

  const slots = await loadAvailableSlots({
    client,
    orderTemplate,
    logger
  });

  if (slots.length === 0) {
    logger.warn("No available slots returned for the current template.");
    return {
      action: "skip",
      reason: "no-slots"
    };
  }

  const selectedSlot = pickBestSlot({
    slots,
    existingOrders,
    config
  });

  if (!selectedSlot) {
    logger.warn("No uncovered future week is currently available for booking.");
    return {
      action: "skip",
      reason: "weeks-already-covered-or-no-valid-slot"
    };
  }

  const bookingPayload = {
    _id: selectedSlot._id || orderTemplate.Employye._id,
    treatment: orderTemplate.Treatment,
    dateAndhour: selectedSlot.DateAndHour,
    timeString:
      selectedSlot.DateAndHourString || formatHourMinute(new Date(selectedSlot.DateAndHour), config.timezone),
    user: userProfile,
    notification: buildNotification({
      user: userProfile,
      template: orderTemplate,
      slot: selectedSlot,
      config
    }),
    updateMessage: buildUpdateMessage({
      user: userProfile,
      template: orderTemplate,
      slot: selectedSlot,
      config
    })
  };

  logger.info("Selected slot.", {
    slot: selectedSlot._debug?.localDateTime ?? formatDateTime(new Date(selectedSlot.DateAndHour), config.timezone),
    employeeName: orderTemplate.Employye.Name,
    treatmentName: orderTemplate.Treatment.Name,
    dryRun: config.dryRun
  });

  if (config.dryRun) {
    logger.warn("Dry-run mode is enabled. No booking request was sent.");
    return {
      action: "dry-run",
      ...summarizeSlotForOutput(selectedSlot, config),
      payloadPreview: {
        _id: bookingPayload._id,
        dateAndhour: bookingPayload.dateAndhour,
        timeString: bookingPayload.timeString
      }
    };
  }

  const result = await client.finOrderTor(bookingPayload);
  logger.info("Booking request completed.", { result });

  return {
    action: "booked",
    result,
    ...summarizeSlotForOutput(selectedSlot, config)
  };
}

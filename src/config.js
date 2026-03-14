import path from "node:path";
import { loadDotEnv } from "./env.js";

const DEFAULT_EMPLOYEE_NAME = "\u05d3\u05d5\u05e8";
const DEFAULT_TREATMENT_NAME = "\u05ea\u05e1\u05e4\u05d5\u05e8\u05ea \u05d2\u05d1\u05e8/\u05d7\u05d9\u05d9\u05dc";

function asBoolean(value, fallback) {
  if (value === undefined) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function asInteger(value, fallback) {
  if (value === undefined || value === "") {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  if (Number.isNaN(parsed)) {
    return fallback;
  }

  return parsed;
}

function asList(value) {
  if (value === undefined || value === "") {
    return [];
  }

  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function absolutePath(cwd, maybePath) {
  if (!maybePath) {
    return null;
  }

  return path.isAbsolute(maybePath) ? maybePath : path.join(cwd, maybePath);
}

export async function loadConfig(cwd) {
  await loadDotEnv(cwd);

  const config = {
    cwd,
    apiBaseUrl: "https://api.eztor.io/api",
    publicBaseUrl: "https://eztor.io",
    uniqeabc: process.env.EZTOR_UNIQEABC || "dorg",
    token: process.env.EZTOR_TOKEN || "",
    timezone: process.env.EZTOR_TIMEZONE || "Asia/Jerusalem",
    targetEmployeeName: process.env.EZTOR_TARGET_EMPLOYEE_NAME || DEFAULT_EMPLOYEE_NAME,
    targetEmployeeId: process.env.EZTOR_TARGET_EMPLOYEE_ID || "",
    targetTreatmentName: process.env.EZTOR_TARGET_TREATMENT_NAME || DEFAULT_TREATMENT_NAME,
    targetTreatmentId: process.env.EZTOR_TARGET_TREATMENT_ID || "",
    userId: process.env.EZTOR_USER_ID || "",
    userProfileFile: absolutePath(cwd, process.env.EZTOR_USER_PROFILE_FILE || "./data/user-profile.json"),
    orderTemplateFile: absolutePath(cwd, process.env.EZTOR_ORDER_TEMPLATE_FILE || "./data/order-template.json"),
    stateFile: absolutePath(cwd, process.env.EZTOR_STATE_FILE || "./data/state.json"),
    discoveryFile: absolutePath(cwd, process.env.EZTOR_DISCOVERY_FILE || "./data/discovery.json"),
    desiredWeekday: asInteger(process.env.EZTOR_DESIRED_WEEKDAY, 2),
    desiredHour: asInteger(process.env.EZTOR_DESIRED_HOUR, 18),
    desiredMinute: asInteger(process.env.EZTOR_DESIRED_MINUTE, 0),
    fallbackAfterHour: asInteger(process.env.EZTOR_FALLBACK_AFTER_HOUR, 16),
    scanIntervalMinutes: asInteger(process.env.EZTOR_SCAN_INTERVAL_MINUTES, 15),
    midnightBurstMinutes: asInteger(process.env.EZTOR_MIDNIGHT_BURST_MINUTES, 20),
    alertRepeatHours: asInteger(process.env.EZTOR_ALERT_REPEAT_HOURS, 12),
    tokenRenewAfterDays: asInteger(process.env.EZTOR_TOKEN_RENEW_AFTER_DAYS, 25),
    dryRun: asBoolean(process.env.EZTOR_DRY_RUN, true),
    logLevel: process.env.LOG_LEVEL || "info",
    resendApiKey: process.env.RESEND_API_KEY || "",
    alertEmailFrom: process.env.EZTOR_ALERT_EMAIL_FROM || "",
    alertEmailTo: asList(process.env.EZTOR_ALERT_EMAIL_TO),
    telegramBotToken: process.env.EZTOR_TELEGRAM_BOT_TOKEN || "",
    telegramChatId: process.env.EZTOR_TELEGRAM_CHAT_ID || "",
    twilioAccountSid: process.env.EZTOR_TWILIO_ACCOUNT_SID || "",
    twilioAuthToken: process.env.EZTOR_TWILIO_AUTH_TOKEN || "",
    twilioFromNumber: process.env.EZTOR_TWILIO_FROM_NUMBER || "",
    twilioToNumber: process.env.EZTOR_TWILIO_TO_NUMBER || ""
  };

  if (!config.token) {
    throw new Error("Missing EZTOR_TOKEN. Add it to .env or the environment before running the bot.");
  }

  return config;
}

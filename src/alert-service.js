import crypto from "node:crypto";
import { formatDateTime } from "./time.js";

function fingerprintToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function hoursToMilliseconds(hours) {
  return Math.max(1, hours) * 60 * 60 * 1000;
}

function daysToMilliseconds(days) {
  return Math.max(1, days) * 24 * 60 * 60 * 1000;
}

function buildAlertMessage({ config, error, reason }) {
  const timestamp = formatDateTime(new Date(), config.timezone);
  const errorText = error?.message || "Unknown token error";

  return [
    "הבוט של דור צריך חידוש טוקן.",
    `זוהה כשל אימות בתאריך ${timestamp}.`,
    `סיבת הריצה: ${reason}.`,
    `השגיאה שהתקבלה: ${errorText}`,
    "יש לעדכן את EZTOR_TOKEN ולהפעיל מחדש את הבוט."
  ].join("\n");
}

export function isTokenInvalidError(error) {
  if (!error) {
    return false;
  }

  if (error.isAuthFailure === true) {
    return true;
  }

  const message = String(error.message || error);
  return /\[401\]|\[403\]|unauthorized|forbidden|invalid token|expired token|jwt/i.test(message);
}

export class AlertService {
  constructor({ config, stateStore, logger }) {
    this.config = config;
    this.stateStore = stateStore;
    this.logger = logger;
  }

  async clearInvalidTokenAlert() {
    const state = await this.stateStore.load();

    if (!state.invalidTokenAlert) {
      return;
    }

    await this.stateStore.merge({
      invalidTokenAlert: null
    });
  }

  async recordHealthyToken({ token, reason }) {
    const state = await this.stateStore.load();
    const tokenFingerprint = fingerprintToken(token);
    const tracking = state.tokenTracking;

    if (!tracking || tracking.tokenFingerprint !== tokenFingerprint) {
      await this.stateStore.merge({
        tokenTracking: {
          tokenFingerprint,
          firstSeenAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString()
        },
        tokenAgeAlert: null
      });
      return;
    }

    await this.stateStore.merge({
      tokenTracking: {
        ...tracking,
        lastSeenAt: new Date().toISOString()
      }
    });

    await this.maybeNotifyOldToken({
      tokenFingerprint,
      firstSeenAt: tracking.firstSeenAt,
      reason
    });
  }

  async notifyInvalidToken({ token, error, reason }) {
    const state = await this.stateStore.load();
    const alertState = state.invalidTokenAlert;
    const tokenFingerprint = fingerprintToken(token);
    const repeatMs = hoursToMilliseconds(this.config.alertRepeatHours);
    const now = Date.now();

    if (
      alertState &&
      alertState.tokenFingerprint === tokenFingerprint &&
      now - new Date(alertState.notifiedAt).getTime() < repeatMs
    ) {
      this.logger.warn("Token alert already sent recently. Skipping duplicate notification.", {
        notifiedAt: alertState.notifiedAt
      });
      return;
    }

    const text = buildAlertMessage({
      config: this.config,
      error,
      reason
    });
    const channels = [];

    if (await this.sendEmail(text)) {
      channels.push("email");
    }

    if (await this.sendTelegram(text)) {
      channels.push("telegram");
    }

    if (await this.sendTwilioSms(text)) {
      channels.push("twilio-sms");
    }

    if (channels.length === 0) {
      this.logger.warn("No token alert channels are configured. Skipping external notification.");
      return;
    }

    await this.stateStore.merge({
      invalidTokenAlert: {
        tokenFingerprint,
        notifiedAt: new Date().toISOString(),
        channels,
        errorMessage: error?.message || ""
      }
    });

    this.logger.warn("Sent token renewal alert.", { channels });
  }

  async maybeNotifyOldToken({ tokenFingerprint, firstSeenAt, reason }) {
    if (this.config.tokenRenewAfterDays <= 0) {
      return;
    }

    const tokenAgeMs = Date.now() - new Date(firstSeenAt).getTime();

    if (tokenAgeMs < daysToMilliseconds(this.config.tokenRenewAfterDays)) {
      return;
    }

    const state = await this.stateStore.load();
    const alertState = state.tokenAgeAlert;
    const repeatMs = hoursToMilliseconds(this.config.alertRepeatHours);

    if (
      alertState &&
      alertState.tokenFingerprint === tokenFingerprint &&
      Date.now() - new Date(alertState.notifiedAt).getTime() < repeatMs
    ) {
      return;
    }

    const ageDays = Math.floor(tokenAgeMs / (24 * 60 * 60 * 1000));
    const text = [
      "הטוקן של dor-bot כנראה מתקרב לפקיעה וצריך חידוש.",
      `הטוקן הנוכחי נמצא בשימוש לפחות ${ageDays} ימים.`,
      `סיבת הריצה: ${reason}.`,
      `נכון לעכשיו: ${formatDateTime(new Date(), this.config.timezone)}`,
      "כדאי לעדכן את EZTOR_TOKEN לפני שההזמנה הבאה תיתקע."
    ].join("\n");
    const channels = [];

    if (await this.sendEmail(text)) {
      channels.push("email");
    }

    if (await this.sendTelegram(text)) {
      channels.push("telegram");
    }

    if (await this.sendTwilioSms(text)) {
      channels.push("twilio-sms");
    }

    if (channels.length === 0) {
      return;
    }

    await this.stateStore.merge({
      tokenAgeAlert: {
        tokenFingerprint,
        notifiedAt: new Date().toISOString(),
        tokenAgeDays: ageDays,
        channels
      }
    });

    this.logger.warn("Sent token age renewal reminder.", {
      channels,
      tokenAgeDays: ageDays
    });
  }

  async sendEmail(text) {
    if (!this.config.resendApiKey || !this.config.alertEmailFrom || this.config.alertEmailTo.length === 0) {
      return false;
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.resendApiKey}`
      },
      body: JSON.stringify({
        from: this.config.alertEmailFrom,
        to: this.config.alertEmailTo,
        subject: "dor-bot: צריך לחדש את הטוקן",
        text
      }),
      signal: AbortSignal.timeout(20_000)
    });

    if (!response.ok) {
      const body = await response.text();
      this.logger.error("Failed to send token alert email.", {
        status: response.status,
        body
      });
      return false;
    }

    return true;
  }

  async sendTelegram(text) {
    if (!this.config.telegramBotToken || !this.config.telegramChatId) {
      return false;
    }

    const response = await fetch(`https://api.telegram.org/bot${this.config.telegramBotToken}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chat_id: this.config.telegramChatId,
        text
      }),
      signal: AbortSignal.timeout(20_000)
    });

    if (!response.ok) {
      const body = await response.text();
      this.logger.error("Failed to send Telegram token alert.", {
        status: response.status,
        body
      });
      return false;
    }

    return true;
  }

  async sendTwilioSms(text) {
    if (
      !this.config.twilioAccountSid ||
      !this.config.twilioAuthToken ||
      !this.config.twilioFromNumber ||
      !this.config.twilioToNumber
    ) {
      return false;
    }

    const form = new URLSearchParams({
      From: this.config.twilioFromNumber,
      To: this.config.twilioToNumber,
      Body: text
    });
    const credentials = Buffer.from(
      `${this.config.twilioAccountSid}:${this.config.twilioAuthToken}`,
      "utf8"
    ).toString("base64");
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${this.config.twilioAccountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: form,
        signal: AbortSignal.timeout(20_000)
      }
    );

    if (!response.ok) {
      const body = await response.text();
      this.logger.error("Failed to send Twilio SMS token alert.", {
        status: response.status,
        body
      });
      return false;
    }

    return true;
  }
}

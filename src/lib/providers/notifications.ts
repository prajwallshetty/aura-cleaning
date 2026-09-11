import "server-only";
import type { NotificationChannel } from "@/generated/prisma/enums";

export interface OutboundMessage {
  channel: NotificationChannel;
  to: string;
  subject?: string | null;
  body: string;
  templateCode?: string | null;
  variables?: Record<string, string>;
}

export interface DispatchResult {
  success: boolean;
  providerMessageId?: string;
  error?: string;
}

export interface NotificationTransport {
  readonly channel: NotificationChannel;
  send(message: OutboundMessage): Promise<DispatchResult>;
}

/** Development transport — records to the server log instead of sending. */
class LogTransport implements NotificationTransport {
  constructor(readonly channel: NotificationChannel) {}

  async send(message: OutboundMessage): Promise<DispatchResult> {
    console.info(
      `[notifications:${this.channel}] → ${message.to}\n${message.subject ? `${message.subject}\n` : ""}${message.body}`,
    );
    return {
      success: true,
      providerMessageId: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    };
  }
}

/** WhatsApp Business Cloud API (Meta Graph). */
class WhatsAppCloudTransport implements NotificationTransport {
  readonly channel: NotificationChannel = "WHATSAPP";

  async send(message: OutboundMessage): Promise<DispatchResult> {
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const version = process.env.WHATSAPP_API_VERSION ?? "v21.0";

    if (!token || !phoneNumberId) {
      return { success: false, error: "WhatsApp credentials are not configured" };
    }

    // Business-initiated conversations must use an approved template; free-form
    // text only works inside an open 24-hour customer service window.
    const payload = message.templateCode
      ? {
          messaging_product: "whatsapp",
          to: message.to,
          type: "template",
          template: {
            name: message.templateCode,
            language: { code: process.env.WHATSAPP_TEMPLATE_LANG ?? "en" },
            components: message.variables
              ? [
                  {
                    type: "body",
                    parameters: Object.values(message.variables).map((text) => ({
                      type: "text",
                      text,
                    })),
                  },
                ]
              : undefined,
          },
        }
      : {
          messaging_product: "whatsapp",
          to: message.to,
          type: "text",
          text: { body: message.body },
        };

    try {
      const response = await fetch(
        `https://graph.facebook.com/${version}/${phoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
      );

      const data = (await response.json()) as {
        messages?: Array<{ id: string }>;
        error?: { message: string };
      };

      if (!response.ok) {
        return { success: false, error: data.error?.message ?? `HTTP ${response.status}` };
      }

      return { success: true, providerMessageId: data.messages?.[0]?.id };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }
}

/** Generic SMS gateway using the Twilio-style REST shape. */
class SmsTransport implements NotificationTransport {
  readonly channel: NotificationChannel = "SMS";

  async send(message: OutboundMessage): Promise<DispatchResult> {
    const accountSid = process.env.SMS_ACCOUNT_SID;
    const authToken = process.env.SMS_AUTH_TOKEN;
    const sender = process.env.SMS_SENDER_ID;

    if (!accountSid || !authToken || !sender) {
      return { success: false, error: "SMS credentials are not configured" };
    }

    try {
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            To: message.to,
            From: sender,
            Body: message.body,
          }),
        },
      );

      const data = (await response.json()) as { sid?: string; message?: string };
      if (!response.ok) {
        return { success: false, error: data.message ?? `HTTP ${response.status}` };
      }
      return { success: true, providerMessageId: data.sid };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }
}

/** Transactional email over the Resend HTTP API. */
class EmailTransport implements NotificationTransport {
  readonly channel: NotificationChannel = "EMAIL";

  async send(message: OutboundMessage): Promise<DispatchResult> {
    const apiKey = process.env.EMAIL_API_KEY;
    const from = process.env.EMAIL_FROM;

    if (!apiKey || !from) {
      return { success: false, error: "Email credentials are not configured" };
    }

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [message.to],
          subject: message.subject ?? "Notification",
          text: message.body,
        }),
      });

      const data = (await response.json()) as { id?: string; message?: string };
      if (!response.ok) {
        return { success: false, error: data.message ?? `HTTP ${response.status}` };
      }
      return { success: true, providerMessageId: data.id };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }
}

const transports = new Map<NotificationChannel, NotificationTransport>();

export function getTransport(channel: NotificationChannel): NotificationTransport {
  const cached = transports.get(channel);
  if (cached) return cached;

  const driver = (process.env.NOTIFICATIONS_DRIVER ?? "log").toLowerCase();
  let transport: NotificationTransport;

  if (driver === "log") {
    transport = new LogTransport(channel);
  } else {
    switch (channel) {
      case "WHATSAPP":
        transport = new WhatsAppCloudTransport();
        break;
      case "SMS":
        transport = new SmsTransport();
        break;
      case "EMAIL":
        transport = new EmailTransport();
        break;
      default:
        transport = new LogTransport(channel);
    }
  }

  transports.set(channel, transport);
  return transport;
}

/** Replaces {{placeholders}} in a template body. */
export function renderTemplate(
  template: string,
  variables: Record<string, string | number | null | undefined>,
): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => {
    const value = variables[key];
    return value === null || value === undefined ? "" : String(value);
  });
}

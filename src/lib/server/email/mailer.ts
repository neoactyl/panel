import { createTransport, type Transporter } from "nodemailer";
import {
  getBool,
  getBranding,
  getNumber,
  getSetting,
  type SettingKey,
} from "#lib/server/config/settings.ts";
import {
  readEmailTemplateFile,
  updateEmailTemplateFile,
} from "#lib/server/email/template-store.ts";
import {
  DEFAULT_EMAIL_LAYOUT_KEY,
  DEFAULT_EMAIL_TEMPLATES,
  findEmailTemplate,
  getEmailBaseVariables,
  renderEmail,
  renderTemplateString,
  type EmailTemplateDefinition,
} from "#lib/server/email/templates.ts";
import {
  EMAIL_EVENTS,
  findEmailEvent,
  type EmailEventKey,
} from "#lib/server/email/events.ts";

export type SmtpConfig = {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  requireTls: boolean;
  /** Never upgrade to STARTTLS; send in plaintext even if the server offers it. */
  ignoreTls: boolean;
  user: string;
  password: string;
  fromEmail: string;
  fromName: string;
  replyTo: string;
  configured: boolean;
};

export type EmailSendResult = {
  sent: boolean;
  reason?: string;
  messageId?: string;
};

export type EmailTemplateView = EmailTemplateDefinition & {
  customized: boolean;
  sampleVariables: Record<string, string>;
};

const SMTP_TIMEOUT_MS = 20_000;

export const getSmtpConfig = (): SmtpConfig => {
  const enabled = getBool("smtp.enabled");
  const host = getSetting("smtp.host").trim();
  const rawPort = Math.floor(getNumber("smtp.port"));
  const port = rawPort >= 1 && rawPort <= 65_535 ? rawPort : 587;
  const user = getSetting("smtp.user").trim();
  const fromEmail = getSetting("smtp.fromEmail").trim() || user;
  const fromName = getSetting("smtp.fromName").trim() || getBranding().name;

  return {
    enabled,
    host,
    port,
    secure: getBool("smtp.secure"),
    requireTls: getBool("smtp.requireTls"),
    ignoreTls: getBool("smtp.ignoreTls"),
    user,
    password: getSetting("smtp.password"),
    fromEmail,
    fromName,
    replyTo: getSetting("smtp.replyTo").trim(),
    configured: enabled && Boolean(host) && Boolean(fromEmail),
  };
};

export const isEmailReady = () => getSmtpConfig().configured;

let cachedTransport: { key: string; transporter: Transporter } | undefined;

const getTransport = () => {
  const config = getSmtpConfig();
  if (!config.configured) return null;

  const key = JSON.stringify([
    config.host,
    config.port,
    config.secure,
    config.requireTls,
    config.ignoreTls,
    config.user,
    config.password,
  ]);

  if (cachedTransport?.key !== key) {
    cachedTransport = {
      key,
      transporter: createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        requireTLS: config.requireTls,
        ignoreTLS: config.ignoreTls,
        auth: config.user
          ? { user: config.user, pass: config.password }
          : undefined,
        connectionTimeout: SMTP_TIMEOUT_MS,
        greetingTimeout: SMTP_TIMEOUT_MS,
        socketTimeout: SMTP_TIMEOUT_MS,
      }),
    };
  }

  return cachedTransport.transporter;
};

export const resetEmailTransport = () => {
  cachedTransport = undefined;
};

const SAMPLE_PANEL_URL = "https://panel.example.com";

/** Remove CR/LF and control characters so values cannot inject extra headers. */
const sanitizeHeaderValue = (value: string) =>
  value
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const fromHeader = (config: SmtpConfig) => {
  const email = sanitizeHeaderValue(config.fromEmail);
  const name = sanitizeHeaderValue(config.fromName);

  return name
    ? `"${name.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}" <${email}>`
    : email;
};

const htmlToText = (value: string) =>
  value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

type SendRawInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export const sendRawEmail = async ({
  to,
  subject,
  html,
  text,
}: SendRawInput): Promise<EmailSendResult> => {
  const config = getSmtpConfig();

  if (!config.configured) {
    return {
      sent: false,
      reason: config.enabled
        ? "SMTP is enabled, but the host or sender address is missing."
        : "SMTP is disabled.",
    };
  }

  const transport = getTransport();
  if (!transport) return { sent: false, reason: "SMTP is disabled." };

  const recipient = sanitizeHeaderValue(to);
  if (!recipient)
    return { sent: false, reason: "No recipient address was provided." };

  try {
    const info = await transport.sendMail({
      from: fromHeader(config),
      to: recipient,
      subject: sanitizeHeaderValue(subject),
      html,
      text: text ?? htmlToText(html),
      replyTo: config.replyTo ? sanitizeHeaderValue(config.replyTo) : undefined,
    });

    return { sent: true, messageId: info.messageId };
  } catch (cause) {
    console.error(`Unable to send email to ${to}.`, cause);
    return {
      sent: false,
      reason:
        cause instanceof Error
          ? cause.message
          : "The SMTP server rejected the message.",
    };
  }
};

const sampleVariables = (template: EmailTemplateDefinition) =>
  Object.fromEntries(
    template.variables.map((variable) => [variable.key, variable.sample]),
  );

export const getEmailTemplate = async (
  key: string,
): Promise<EmailTemplateView | null> => {
  const definition = findEmailTemplate(key);
  if (!definition) return null;

  const stored = (await readEmailTemplateFile())[key];

  return {
    ...definition,
    subject: stored?.subject ?? definition.subject,
    body: stored?.body ?? definition.body,
    customized: Boolean(stored),
    sampleVariables: sampleVariables(definition),
  };
};

export const listEmailTemplates = async (): Promise<EmailTemplateView[]> => {
  const overrides = await readEmailTemplateFile();

  return DEFAULT_EMAIL_TEMPLATES.map((definition) => {
    const stored = overrides[definition.key];
    return {
      ...definition,
      subject: stored?.subject ?? definition.subject,
      body: stored?.body ?? definition.body,
      customized: Boolean(stored),
      sampleVariables: sampleVariables(definition),
    };
  });
};

export const saveEmailTemplate = async (
  key: string,
  subject: string,
  body: string,
) => {
  const definition = findEmailTemplate(key);
  if (!definition) throw new Error("Unknown email template.");

  const cleanBody = body.trim();
  if (!cleanBody) throw new Error("The template body cannot be empty.");

  const cleanSubject = key === DEFAULT_EMAIL_LAYOUT_KEY ? "" : subject.trim();

  await updateEmailTemplateFile((templates) => {
    templates[key] = { subject: cleanSubject, body: cleanBody };
  });
};

export const resetEmailTemplate = async (key: string) => {
  if (!findEmailTemplate(key)) throw new Error("Unknown email template.");

  await updateEmailTemplateFile((templates) => {
    delete templates[key];
  });
};

export type SendTemplateInput = {
  to: string;
  variables?: Record<string, unknown>;
};

export const sendTemplateEmail = async (
  templateKey: string,
  { to, variables = {} }: SendTemplateInput,
): Promise<EmailSendResult> => {
  if (!to.trim())
    return { sent: false, reason: "No recipient address was provided." };
  if (!isEmailReady()) {
    return { sent: false, reason: "SMTP is not configured or is disabled." };
  }

  const [layout, template] = await Promise.all([
    getEmailTemplate(DEFAULT_EMAIL_LAYOUT_KEY),
    getEmailTemplate(templateKey),
  ]);

  if (!layout || !template) {
    return { sent: false, reason: "The email template could not be found." };
  }

  const rendered = renderEmail({
    layout: { subject: layout.subject, body: layout.body },
    template: { subject: template.subject, body: template.body },
    variables,
  });

  return sendRawEmail({ to, subject: rendered.subject, html: rendered.html });
};

export const sendEventEmail = async (
  eventKey: EmailEventKey,
  { to, variables = {} }: SendTemplateInput,
): Promise<EmailSendResult> => {
  const event = findEmailEvent(eventKey);
  if (!event) return { sent: false, reason: "Unknown email event." };
  if (!getBool(event.key))
    return { sent: false, reason: "This email is disabled." };

  return sendTemplateEmail(event.templateKey, { to, variables });
};

export const sendTestEmail = async (to: string, templateKey?: string) => {
  if (templateKey) {
    const template = await getEmailTemplate(templateKey);
    if (!template)
      return { sent: false, reason: "The email template could not be found." };

    const base = getEmailBaseVariables();
    // Use real branding and panel links, substituting the sample panel URL
    // so test buttons point at the actual panel instead of example.com.
    const variables = Object.fromEntries(
      Object.entries(template.sampleVariables).map(([key, value]) => [
        key,
        value.split(SAMPLE_PANEL_URL).join(base.panelUrl || SAMPLE_PANEL_URL),
      ]),
    );

    return sendTemplateEmail(templateKey, {
      to,
      variables: { ...variables, ...base, userEmail: to },
    });
  }

  const layout = await getEmailTemplate(DEFAULT_EMAIL_LAYOUT_KEY);
  if (!layout)
    return { sent: false, reason: "The email layout could not be found." };

  const variables = {
    userName: "there",
    ...getEmailBaseVariables(),
  };
  const subject = "Your SMTP settings work";
  const content =
    '<h1 style="margin:0 0 14px;font-size:20px;line-height:1.3;color:#ffffff;">SMTP is working</h1>' +
    '<p style="margin:0 0 14px;">Hi {{userName}},</p>' +
    '<p style="margin:0;">This is a test message sent by the admin email settings page. If you can read it, outgoing mail is configured correctly.</p>';
  const html = renderTemplateString(
    layout.body,
    {
      ...variables,
      subject,
      content: renderTemplateString(content, variables),
    },
    { allowRawContent: true },
  );

  return sendRawEmail({ to, subject, html });
};

export const verifySmtpConnection = async (): Promise<EmailSendResult> => {
  const config = getSmtpConfig();
  if (!config.configured) {
    return {
      sent: false,
      reason: config.enabled
        ? "Add an SMTP host and sender address first."
        : "SMTP is disabled.",
    };
  }

  const transport = getTransport();
  if (!transport) return { sent: false, reason: "SMTP is disabled." };

  try {
    await transport.verify();
    return { sent: true };
  } catch (cause) {
    return {
      sent: false,
      reason:
        cause instanceof Error
          ? cause.message
          : "The SMTP server could not be reached.",
    };
  }
};

/** Every event toggle paired with the setting key that controls it. */
export const emailEventSettings = () =>
  EMAIL_EVENTS.map((event) => ({
    key: event.key as SettingKey,
    label: event.label,
    description: event.description,
    enabled: getBool(event.key),
  }));

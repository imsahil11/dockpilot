import nodemailer from "nodemailer";
import { config, logger } from "../config";

export interface AlertEmailPayload {
  containerName: string;
  alertType: string;
  severity: string;
  thresholdValue?: number | null;
  actualValue?: number | null;
  createdAt: Date;
}

export class EmailService {
  private readonly transporter =
    config.smtp.host && config.smtp.user && config.smtp.pass
      ? nodemailer.createTransport({
          host: config.smtp.host,
          port: config.smtp.port,
          secure: config.smtp.port === 465,
          auth: {
            user: config.smtp.user,
            pass: config.smtp.pass
          }
        })
      : null;

  public isConfigured(): boolean {
    return Boolean(this.transporter && config.smtp.from);
  }

  public async sendAlertEmail(payload: AlertEmailPayload): Promise<void> {
    if (!this.transporter || !config.smtp.from) {
      return;
    }

    const subject = `[DockPilot] ${payload.severity.toUpperCase()} alert on ${payload.containerName}`;
    const text = [
      "DockPilot alert triggered",
      `Container: ${payload.containerName}`,
      `Type: ${payload.alertType}`,
      `Severity: ${payload.severity}`,
      payload.thresholdValue !== undefined && payload.thresholdValue !== null
        ? `Threshold: ${payload.thresholdValue}`
        : null,
      payload.actualValue !== undefined && payload.actualValue !== null
        ? `Actual: ${payload.actualValue}`
        : null,
      `Time: ${payload.createdAt.toISOString()}`
    ]
      .filter(Boolean)
      .join("\n");

    await this.transporter.sendMail({
      from: config.smtp.from,
      to: config.smtp.user,
      subject,
      text
    });

    logger.info(`Alert email sent for ${payload.containerName}/${payload.alertType}`);
  }
}

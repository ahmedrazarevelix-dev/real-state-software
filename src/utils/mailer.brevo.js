const { BrevoClient } = require("@getbrevo/brevo");

const PLACEHOLDER_API_KEYS = new Set([
    "",
    "your_brevo_api_key_here",
]);

const otpEmailHtml = (otp, label, expiryMinutes) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <style>
    body { font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 0; }
    .container { max-width: 480px; margin: 40px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .header { background: #4F46E5; padding: 24px 32px; }
    .header h1 { color: #ffffff; margin: 0; font-size: 22px; }
    .body { padding: 32px; }
    .otp-box { background: #F3F4F6; border-radius: 8px; text-align: center; padding: 24px; margin: 24px 0; }
    .otp-code { font-size: 40px; font-weight: bold; letter-spacing: 10px; color: #4F46E5; }
    .expiry { color: #6B7280; font-size: 14px; margin-top: 8px; }
    .footer { background: #F9FAFB; padding: 16px 32px; text-align: center; color: #9CA3AF; font-size: 12px; }
    p { color: #374151; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>Real Estate Platform</h1></div>
    <div class="body">
      <p>Hi there,</p>
      <p>You requested a <strong>${label}</strong>. Use the OTP below to proceed:</p>
      <div class="otp-box">
        <div class="otp-code">${otp}</div>
        <div class="expiry">Expires in ${expiryMinutes} minutes</div>
      </div>
      <p>If you did not request this, please ignore this email. Your account remains secure.</p>
      <p>— The Real Estate Platform Team</p>
    </div>
    <div class="footer">This is an automated email. Please do not reply.</div>
  </div>
</body>
</html>`;

const otpEmailText = (otp, label, expiryMinutes) =>
    `Real Estate Platform\n\nYour ${label} is ${otp}. It expires in ${expiryMinutes} minutes.\n\nIf you did not request this, ignore this email.`;

let clientCache = null;

const getApiKey = () => (process.env.BREVO_API_KEY || "").trim();

const getFromEmail = () =>
    (process.env.BREVO_FROM_EMAIL || process.env.GMAIL_USER || "").trim();

const isBrevoConfigured = () => {
    const apiKey = getApiKey();
    const fromEmail = getFromEmail();
    return Boolean(
        apiKey &&
        !PLACEHOLDER_API_KEYS.has(apiKey) &&
        apiKey.startsWith("xkeysib-") &&
        fromEmail.includes("@")
    );
};

const getBrevoClient = () => {
    if (clientCache) return clientCache;

    const apiKey = getApiKey();
    const fromEmail = getFromEmail();
    const fromName = (process.env.BREVO_FROM_NAME || "Real Estate Platform").trim();

    if (!isBrevoConfigured()) {
        throw new Error(
            "[BREVO] Not configured. Set BREVO_API_KEY (xkeysib-...) and BREVO_FROM_EMAIL to a verified sender email."
        );
    }

    clientCache = {
        client: new BrevoClient({ apiKey, timeoutInSeconds: 30, maxRetries: 2 }),
        fromEmail,
        fromName,
    };

    console.log(`[BREVO] Initialized FROM: "${fromName}" <${fromEmail}>`);
    return clientCache;
};

const describeBrevoError = (error) => {
    const status = error.statusCode || error.status;
    const body = error.body;
    const bodyMsg =
        (body && (body.message || body.error || JSON.stringify(body))) || "";
    return [error.message, status && `status=${status}`, bodyMsg]
        .filter(Boolean)
        .join(" | ");
};

const sendEmail = async ({ to, subject, html, text }) => {
    const { client, fromEmail, fromName } = getBrevoClient();

    console.log(`[BREVO] Sending "${subject}" to ${to} from ${fromEmail}`);

    try {
        const data = await client.transactionalEmails.sendTransacEmail({
            sender: { name: fromName, email: fromEmail },
            to: [{ email: to }],
            subject,
            htmlContent: html,
            textContent: text,
        });

        const messageId = data?.messageId || data?.body?.messageId;
        console.log(`[BREVO] Sent to ${to}${messageId ? ` | id=${messageId}` : ""}`);
        return data;
    } catch (error) {
        console.error(`[BREVO] Failed to send to ${to}: ${describeBrevoError(error)}`);
        throw error;
    }
};

const sendRegistrationOtp = async (toEmail, otp) => {
    const expiryMinutes = parseInt(process.env.OTP_EXPIRY_MINUTES, 10) || 10;
    await sendEmail({
        to: toEmail,
        subject: "Your Verification OTP",
        html: otpEmailHtml(otp, "Email Verification OTP", expiryMinutes),
        text: otpEmailText(otp, "Email Verification OTP", expiryMinutes),
    });
};

const sendPasswordResetOtp = async (toEmail, otp) => {
    const expiryMinutes = parseInt(process.env.OTP_EXPIRY_MINUTES, 10) || 10;
    await sendEmail({
        to: toEmail,
        subject: "Your Password Reset OTP",
        html: otpEmailHtml(otp, "Password Reset OTP", expiryMinutes),
        text: otpEmailText(otp, "Password Reset OTP", expiryMinutes),
    });
};

module.exports = {
    isBrevoConfigured,
    sendRegistrationOtp,
    sendPasswordResetOtp,
};

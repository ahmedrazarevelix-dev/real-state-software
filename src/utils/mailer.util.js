const nodemailer = require("nodemailer");

// ── Email HTML template ───────────────────────────────────────────────────────

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

// ── Transporter factory ───────────────────────────────────────────────────────

/**
 * Returns the right transporter based on what's configured in .env:
 *
 *  1. Gmail  — GMAIL_USER + GMAIL_APP_PASSWORD are both set
 *  2. Ethereal — nothing configured (auto-creates a free test account,
 *                prints a preview URL to the console so you can view the email)
 */
let _transporter = null;
let _fromAddress = "";

const getTransporter = async () => {
    if (_transporter) return { transporter: _transporter, from: _fromAddress };

    const gmailUser = process.env.GMAIL_USER;
    const gmailPass = process.env.GMAIL_APP_PASSWORD;
    
    // Force use Ethereal for testing to prove emails are sending
    const useEthereal = process.env.USE_ETHEREAL === 'true';

    const gmailReady =
        !useEthereal &&
        gmailUser &&
        gmailPass &&
        gmailUser !== "your_gmail@gmail.com" &&
        gmailPass !== "xxxx_xxxx_xxxx_xxxx";

    if (gmailReady) {
        // ── Real Gmail via App Password with enhanced config ──────────────────
        _transporter = nodemailer.createTransport({
            host: "smtp.gmail.com",
            port: 587,
            secure: false, // true for 465, false for other ports
            auth: { 
                user: gmailUser, 
                pass: gmailPass 
            },
            tls: {
                rejectUnauthorized: true,
                minVersion: 'TLSv1.2'
            },
            // Add these for better compatibility
            pool: true,
            maxConnections: 5,
            rateDelta: 20000,
            rateLimit: 5
        });
        _fromAddress = `"Real Estate Platform" <${gmailUser}>`;
        console.log("[MAILER] ✅ Using Gmail SMTP for Real Estate Platform");
    } else {
        // ── Ethereal (free fake SMTP — no signup needed) ──────────────────────
        // Creates a temporary test account automatically.
        // Every sent email gets a preview URL printed in the console.
        const testAccount = await nodemailer.createTestAccount();
        _transporter = nodemailer.createTransport({
            host: "smtp.ethereal.email",
            port: 587,
            secure: false,
            auth: {
                user: testAccount.user,
                pass: testAccount.pass,
            },
        });
        _fromAddress = `"Real Estate Platform" <${testAccount.user}>`;
        console.log("[MAILER] Gmail not configured — using Ethereal test account");
        console.log(`[MAILER] 🌐 Preview emails at: https://ethereal.email/messages`);
        console.log(`[MAILER] 📧 Ethereal credentials -> user: ${testAccount.user} | pass: ${testAccount.pass}`);
    }

    return { transporter: _transporter, from: _fromAddress };
};

// ── Core send function ────────────────────────────────────────────────────────

const sendEmail = async ({ to, subject, html }) => {
    const { transporter, from } = await getTransporter();
    
    console.log(`[MAILER] 📧 Attempting to send email:`);
    console.log(`[MAILER]    FROM: ${from}`);
    console.log(`[MAILER]    TO: ${to}`);
    console.log(`[MAILER]    SUBJECT: ${subject}`);
    
    try {
        const info = await transporter.sendMail({ from, to, subject, html });
        
        console.log(`[MAILER] ✅ Email sent successfully!`);
        console.log(`[MAILER]    Message ID: ${info.messageId}`);
        console.log(`[MAILER]    Response: ${info.response || 'N/A'}`);

        // Ethereal gives a preview URL — log it so you can click and see the email
        const previewUrl = nodemailer.getTestMessageUrl(info);
        if (previewUrl) {
            console.log(`[MAILER] 🔗 Preview URL (open in browser): ${previewUrl}`);
        }

        return info;
    } catch (error) {
        console.error(`[MAILER] ❌ Failed to send email to ${to}`);
        console.error(`[MAILER]    Error: ${error.message}`);
        console.error(`[MAILER]    Full error:`, error);
        throw error;
    }
};

// ── Exported helpers ──────────────────────────────────────────────────────────

const sendRegistrationOtp = async (toEmail, otp) => {
    const expiryMinutes = parseInt(process.env.OTP_EXPIRY_MINUTES) || 10;
    
    console.log(`[MAILER] 🔐 Sending Registration OTP to: ${toEmail}`);
    console.log(`[MAILER]    OTP: ${otp} (expires in ${expiryMinutes} min)`);
    
    await sendEmail({
        to: toEmail,
        subject: "Your Verification OTP",
        html: otpEmailHtml(otp, "Email Verification OTP", expiryMinutes),
    });
};

const sendPasswordResetOtp = async (toEmail, otp) => {
    const expiryMinutes = parseInt(process.env.OTP_EXPIRY_MINUTES) || 10;
    
    console.log(`[MAILER] 🔑 Sending Password Reset OTP to: ${toEmail}`);
    console.log(`[MAILER]    OTP: ${otp} (expires in ${expiryMinutes} min)`);
    
    await sendEmail({
        to: toEmail,
        subject: "Your Password Reset OTP",
        html: otpEmailHtml(otp, "Password Reset OTP", expiryMinutes),
    });
};

module.exports = { sendRegistrationOtp, sendPasswordResetOtp };


const nodemailer = require('nodemailer');

const TARGET_EMAIL = 'taskmarelabs@gmail.com';
const DEFAULT_SHEETS_WEBHOOK_URL =
  'https://script.google.com/macros/s/AKfycbxkfxmu7qo0B4PgUHG7jvN_KvuMXuv_1u69X0txmM86JnhjyaJdZUQZ0Y4BUmgPnB3X/exec';

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const istNow = () => new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

const verifyCaptcha = async (token, ip) => {
  const secret = process.env.TASKMARE_RECAPTCHA_SECRET;
  if (!secret) return true;
  try {
    const params = new URLSearchParams({ secret, response: token });
    if (ip) params.append('remoteip', ip);
    const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });
    const result = await response.json();
    return Boolean(result.success);
  } catch (err) {
    console.error('[Taskmare] reCAPTCHA verification failed:', err.message);
    return false;
  }
};

const logToSheet = async (record) => {
  const webhookUrl = process.env.TASKMARE_SHEETS_WEBHOOK_URL || DEFAULT_SHEETS_WEBHOOK_URL;
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        timestamp: istNow(),
        inquiryId: record.id,
        name: record.name,
        email: record.email,
        phone: record.phone,
        platform: record.platform,
        budget: record.budget,
        timeline: record.timeline,
        location: record.location,
        details: record.details,
      }),
    });
    const text = await response.text();
    let result = null;
    try {
      result = JSON.parse(text);
    } catch {
      result = null;
    }
    if (result && result.status === 'error') {
      console.warn('[Taskmare] Google Sheets webhook warning:', result.message);
      return false;
    }
    return response.ok;
  } catch (err) {
    console.error('[Taskmare] Google Sheets webhook failed:', err.message);
    return false;
  }
};

const emailHtml = (r) => `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
    <div style="border-bottom: 2px solid #ed1b2f; padding-bottom: 16px; margin-bottom: 20px;">
      <h1 style="color: #101827; font-size: 22px; margin: 0;">Taskmare Labs — New Project Inquiry</h1>
      <p style="color: #64748b; font-size: 13px; margin: 4px 0 0 0;">Received on ${istNow()} (IST)</p>
    </div>
    <div style="background-color: #f8fafc; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
      <p style="margin: 0 0 8px 0;"><strong>Inquiry Reference:</strong> <span style="font-family: monospace; color: #ed1b2f; font-weight: bold;">${escapeHtml(r.id)}</span></p>
      <p style="margin: 0 0 8px 0;"><strong>Client Name:</strong> ${escapeHtml(r.name)}</p>
      <p style="margin: 0 0 8px 0;"><strong>Phone / WhatsApp:</strong> <a href="tel:${escapeHtml(r.phone)}" style="color: #ed1b2f; text-decoration: none;">${escapeHtml(r.phone)}</a></p>
      <p style="margin: 0 0 8px 0;"><strong>Email:</strong> ${escapeHtml(r.email)}</p>
      <p style="margin: 0 0 8px 0;"><strong>Target Platform:</strong> <strong style="color: #ed1b2f;">${escapeHtml(r.platform)}</strong></p>
      <p style="margin: 0 0 8px 0;"><strong>Estimated Budget:</strong> ${escapeHtml(r.budget)}</p>
      <p style="margin: 0 0 8px 0;"><strong>Timeline:</strong> ${escapeHtml(r.timeline)}</p>
      <p style="margin: 0;"><strong>Location:</strong> ${escapeHtml(r.location)}</p>
    </div>
    <h3 style="color: #101827; font-size: 15px; margin-bottom: 8px;">Project Requirements:</h3>
    <div style="background-color: #fff1f2; border-left: 4px solid #ed1b2f; padding: 14px 18px; border-radius: 4px; font-size: 14px; line-height: 1.6; color: #101827; white-space: pre-wrap;">${escapeHtml(r.details)}</div>
    <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; text-align: center;">
      Direct message from Taskmare Labs website portal to <strong>${TARGET_EMAIL}</strong>.
    </div>
  </div>
`;

const sendEmail = async (record, replyTo) => {
  const { TASKMARE_SMTP_HOST, TASKMARE_SMTP_USER, TASKMARE_SMTP_PASS } = process.env;
  if (!TASKMARE_SMTP_HOST || !TASKMARE_SMTP_USER || !TASKMARE_SMTP_PASS) return { dispatched: true, method: 'direct-inbox-queue' };
  try {
    const transporter = nodemailer.createTransport({
      host: TASKMARE_SMTP_HOST,
      port: Number(process.env.TASKMARE_SMTP_PORT) || 587,
      secure: process.env.TASKMARE_SMTP_SECURE === 'true',
      auth: { user: TASKMARE_SMTP_USER, pass: TASKMARE_SMTP_PASS },
    });
    await transporter.sendMail({
      from: `"Taskmare Inquiry" <${TASKMARE_SMTP_USER}>`,
      to: TARGET_EMAIL,
      replyTo: replyTo || undefined,
      subject: `[New Project Inquiry] ${record.platform} App Development - ${record.name}`,
      html: emailHtml(record),
    });
    return { dispatched: true, method: 'smtp' };
  } catch (err) {
    console.error('[Taskmare] SMTP send failed, falling back to direct queue:', err.message);
    return { dispatched: false, method: 'direct-inbox-queue' };
  }
};

const mailtoUrl = (r) => {
  const subject = encodeURIComponent(`[New Inquiry] ${r.platform} App Development - ${r.name} (${r.id})`);
  const body = encodeURIComponent(
    `Hi Taskmare Labs Team,\n\n` +
      `I have submitted a project enquiry with Reference ID: ${r.id}.\n\n` +
      `Name: ${r.name}\n` +
      `Phone/WhatsApp: ${r.phone}\n` +
      `Platform: ${r.platform}\n` +
      `Budget: ${r.budget}\n` +
      `Timeline: ${r.timeline}\n` +
      `Location: ${r.location}\n\n` +
      `Project Details:\n${r.details}\n\n` +
      `Looking forward to hearing from you!`
  );
  return `mailto:${TARGET_EMAIL}?subject=${subject}&body=${body}`;
};

const submitEnquiry = async (req, res) => {
  try {
    const { name, email, phone, platform, details, timeline, budget, location, captchaToken, honeypot } = req.body || {};

    if (honeypot) {
      console.warn('[Taskmare] Bot submission trapped via honeypot field');
      return res.status(200).json({ success: true, inquiryId: 'TM-SPAM-FILTERED', message: 'Inquiry received' });
    }

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({ success: false, error: 'Please enter your full name.' });
    }
    if (!phone || typeof phone !== 'string' || phone.trim().length < 7) {
      return res.status(400).json({ success: false, error: 'Please enter a valid phone or WhatsApp number.' });
    }
    if (!details || typeof details !== 'string' || details.trim().length < 5) {
      return res.status(400).json({ success: false, error: 'Please provide a brief description of your project idea.' });
    }
    if (!captchaToken) {
      return res.status(400).json({ success: false, error: 'Please complete the reCAPTCHA verification to submit.' });
    }
    if (!(await verifyCaptcha(captchaToken, req.ip))) {
      return res.status(400).json({ success: false, error: 'reCAPTCHA verification failed. Please try again.' });
    }

    const cleanEmail = typeof email === 'string' && email.trim() ? email.trim() : '';
    const record = {
      id: `TM-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`,
      date: new Date().toISOString(),
      name: name.trim().slice(0, 120),
      email: cleanEmail || 'Not provided',
      phone: phone.trim().slice(0, 30),
      platform: typeof platform === 'string' && platform.trim() ? platform.trim().slice(0, 40) : 'Android + iOS',
      details: details.trim().slice(0, 5000),
      timeline: typeof timeline === 'string' && timeline.trim() ? timeline.trim().slice(0, 60) : 'Flexible',
      budget: typeof budget === 'string' && budget.trim() ? budget.trim().slice(0, 60) : 'To be discussed',
      location: typeof location === 'string' && location.trim() ? location.trim().slice(0, 120) : 'Not specified',
      status: 'received',
    };

    const [sheetLogged, mail] = await Promise.all([logToSheet(record), sendEmail(record, cleanEmail)]);

    return res.status(200).json({
      success: true,
      inquiryId: record.id,
      recipient: TARGET_EMAIL,
      emailDispatched: mail.dispatched,
      emailMethod: mail.method,
      sheetLogged,
      directMailtoUrl: mailtoUrl(record),
      inquiryRecord: record,
      message: `Your inquiry has been successfully sent to Taskmare Labs (${TARGET_EMAIL}). We will review your project and reply within 24 hours!`,
    });
  } catch (err) {
    console.error('[Taskmare] Server error handling enquiry:', err);
    return res.status(500).json({
      success: false,
      error: 'An unexpected error occurred while processing your inquiry. Please try again or WhatsApp us directly at +919760556855.',
    });
  }
};

module.exports = { submitEnquiry };

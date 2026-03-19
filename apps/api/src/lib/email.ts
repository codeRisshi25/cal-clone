import { Resend } from "resend";

// Resend throws if API key is missing — make it optional so the app still boots
const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM = "Cal Clone <onboarding@resend.dev>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://cal-clone-olive.vercel.app";

// --- Shared HTML Wrapper ---
const EmailWrapper = (content: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #f3f4f6; margin: 0; padding: 40px 20px; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; border: 1px solid #e5e7eb; overflow: hidden; }
    .header { padding: 24px; text-align: center; border-bottom: 1px solid #e5e7eb; background-color: #fafafa; }
    .header h1 { margin: 0; font-size: 20px; color: #111827; font-weight: 600; }
    .content { padding: 32px 24px; color: #374151; font-size: 16px; line-height: 1.5; }
    .footer { padding: 24px; text-align: center; color: #6b7280; font-size: 14px; background-color: #fafafa; border-top: 1px solid #e5e7eb; }
    .btn { display: inline-block; padding: 12px 24px; background-color: #111827; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: 500; margin-top: 16px; margin-bottom: 16px; }
    .details { background-color: #f9fafb; border-radius: 6px; padding: 16px; margin: 24px 0; border: 1px solid #e5e7eb; }
    .details p { margin: 8px 0; }
    .strong { color: #111827; font-weight: 600; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Cal Clone</h1>
    </div>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      Powered by Scaler AI Labs • <a href="${APP_URL}" style="color:#6b7280;">${APP_URL.replace('https://', '')}</a>
    </div>
  </div>
</body>
</html>
`;

// Send confirmation email to the attendee after booking
export async function sendBookingConfirmation(opts: {
  attendeeName: string;
  attendeeEmail: string;
  hostName: string;
  eventTitle: string;
  startTime: Date;
  endTime: Date;
  timezone: string;
  bookingUid: string;
}) {
  const { attendeeName, attendeeEmail, hostName, eventTitle, startTime, timezone, bookingUid } = opts;

  const formatted = startTime.toLocaleString("en-US", {
    timeZone: timezone,
    dateStyle: "full",
    timeStyle: "short",
  });

  const cancelUrl = `${APP_URL}/booking/${bookingUid}/cancel`;
  const rescheduleUrl = `${APP_URL}/reschedule/${bookingUid}`;

  if (!resend) {
    console.warn("[email] RESEND_API_KEY not set — skipping booking confirmation email");
    return;
  }

  const content = `
    <h2 style="color: #111827; margin-top: 0;">Meeting Confirmed</h2>
    <p>Hi ${attendeeName},</p>
    <p>Your meeting has been successfully scheduled with <span class="strong">${hostName}</span>.</p>
    
    <div class="details">
      <p><span class="strong">What:</span> ${eventTitle}</p>
      <p><span class="strong">When:</span> ${formatted} (${timezone})</p>
    </div>

    <p style="text-align: center;">
      <a href="${rescheduleUrl}" class="btn">Reschedule or Cancel</a>
    </p>
    
    <p style="font-size: 14px; color: #6b7280; margin-top: 32px;">Need immediate help? You can reply directly to this email.</p>
  `;

  await resend.emails.send({
    from: FROM,
    to: attendeeEmail,
    subject: `Confirmed: ${eventTitle} with ${hostName}`,
    html: EmailWrapper(content),
  });
}

// Send reschedule notification email
export async function sendRescheduleEmail(opts: {
  attendeeName: string;
  attendeeEmail: string;
  hostName: string;
  eventTitle: string;
  oldStartTime: Date;
  newStartTime: Date;
  timezone: string;
  newBookingUid: string;
}) {
  const { attendeeName, attendeeEmail, hostName, eventTitle, oldStartTime, newStartTime, timezone, newBookingUid } = opts;

  const oldFormatted = oldStartTime.toLocaleString("en-US", {
    timeZone: timezone,
    dateStyle: "full",
    timeStyle: "short",
  });
  const newFormatted = newStartTime.toLocaleString("en-US", {
    timeZone: timezone,
    dateStyle: "full",
    timeStyle: "short",
  });

  const bookingUrl = `${APP_URL}/booking/${newBookingUid}`;

  if (!resend) {
    console.warn("[email] RESEND_API_KEY not set — skipping reschedule email");
    return;
  }

  const content = `
    <h2 style="color: #111827; margin-top: 0;">Meeting Rescheduled</h2>
    <p>Hi ${attendeeName},</p>
    <p>Your meeting with <span class="strong">${hostName}</span> has been successfully rescheduled to a new time.</p>
    
    <div class="details">
      <p><span style="color:#ef4444;text-decoration:line-through;">Previous: ${oldFormatted}</span></p>
      <p><span class="strong" style="color:#10b981;">New Time: ${newFormatted} (${timezone})</span></p>
    </div>

    <p style="text-align: center;">
      <a href="${bookingUrl}" class="btn">View Booking Details</a>
    </p>
  `;

  await resend.emails.send({
    from: FROM,
    to: attendeeEmail,
    subject: `Rescheduled: ${eventTitle} with ${hostName}`,
    html: EmailWrapper(content),
  });
}

// Send cancellation email
export async function sendCancellationEmail(opts: {
  attendeeName: string;
  attendeeEmail: string;
  hostName: string;
  eventTitle: string;
  startTime: Date;
  timezone: string;
  reason?: string;
}) {
  const { attendeeName, attendeeEmail, hostName, eventTitle, startTime, timezone, reason } = opts;

  const formatted = startTime.toLocaleString("en-US", {
    timeZone: timezone,
    dateStyle: "full",
    timeStyle: "short",
  });

  if (!resend) {
    console.warn("[email] RESEND_API_KEY not set — skipping cancellation email");
    return;
  }

  const content = `
    <h2 style="color: #111827; margin-top: 0;">Meeting Cancelled</h2>
    <p>Hi ${attendeeName},</p>
    <p>Your scheduled meeting with <span class="strong">${hostName}</span> has been cancelled.</p>
    
    <div class="details">
      <p><span class="strong">What:</span> ${eventTitle}</p>
      <p><span class="strong">When:</span> ${formatted} (${timezone})</p>
      ${reason ? `<p style="margin-top: 16px; border-top: 1px solid #e5e7eb; padding-top: 12px;"><span class="strong">Reason for cancellation:</span><br/>"${reason}"</p>` : ""}
    </div>
  `;

  await resend.emails.send({
    from: FROM,
    to: attendeeEmail,
    subject: `Cancelled: ${eventTitle} with ${hostName}`,
    html: EmailWrapper(content),
  });
}

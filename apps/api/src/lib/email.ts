import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = "Cal Clone <noreply@calclone.dev>";

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

  const cancelUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/booking/${bookingUid}/cancel`;

  await resend.emails.send({
    from: FROM,
    to: attendeeEmail,
    subject: `Confirmed: ${eventTitle} with ${hostName}`,
    html: `
      <h2>Your meeting is confirmed!</h2>
      <p>Hi ${attendeeName},</p>
      <p>Your <strong>${eventTitle}</strong> with <strong>${hostName}</strong> is scheduled for:</p>
      <p><strong>${formatted} (${timezone})</strong></p>
      <br/>
      <p>Need to cancel? <a href="${cancelUrl}">Click here</a></p>
    `,
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

  const bookingUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/booking/${newBookingUid}`;

  await resend.emails.send({
    from: FROM,
    to: attendeeEmail,
    subject: `Rescheduled: ${eventTitle} with ${hostName}`,
    html: `
      <h2>Your meeting has been rescheduled</h2>
      <p>Hi ${attendeeName},</p>
      <p>Your <strong>${eventTitle}</strong> with <strong>${hostName}</strong> has been rescheduled.</p>
      <p><s>${oldFormatted} (${timezone})</s></p>
      <p><strong>New time: ${newFormatted} (${timezone})</strong></p>
      <br/>
      <p><a href="${bookingUrl}">View booking details</a></p>
    `,
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

  await resend.emails.send({
    from: FROM,
    to: attendeeEmail,
    subject: `Cancelled: ${eventTitle} with ${hostName}`,
    html: `
      <h2>Your meeting has been cancelled</h2>
      <p>Hi ${attendeeName},</p>
      <p>Your <strong>${eventTitle}</strong> with <strong>${hostName}</strong> scheduled for <strong>${formatted} (${timezone})</strong> has been cancelled.</p>
      ${reason ? `<p>Reason: ${reason}</p>` : ""}
    `,
  });
}

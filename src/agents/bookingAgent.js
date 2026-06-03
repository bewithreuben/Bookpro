function run(task) {
  const booking = task.payload?.booking || {};
  const customerName = task.payload?.customer?.name || "customer";
  const providerName = task.payload?.professionalName || "your BookPro professional";

  if (task.eventType === "booking.created") {
    return {
      action: "send_message",
      summary: `Drafted booking confirmation for ${customerName}.`,
      draft: `Hi ${customerName}, your ${booking.service || "service"} request for ${booking.slot || "your selected time"} is being coordinated with ${providerName}. Reference: ${booking.reference || "pending"}.`
    };
  }

  if (task.eventType === "booking.confirmed") {
    return {
      action: "send_message",
      summary: `Drafted booking reminder for ${customerName}.`,
      draft: `Hi ${customerName}, ${providerName} confirmed your ${booking.service || "service"} booking for ${booking.slot || "the scheduled time"}.`
    };
  }

  return {
    action: "draft_follow_up",
    summary: "Prepared booking follow-up message.",
    draft: "Please confirm whether the job details still work for you, or request a reschedule from your BookPro dashboard."
  };
}

module.exports = { run };

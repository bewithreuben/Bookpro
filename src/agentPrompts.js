const agentPrompts = {
  support: {
    name: "Customer Support Agent",
    mission: "Answer FAQs, sort support tickets, detect urgent customer issues, and route sensitive cases to an admin.",
    prompt: "Classify the customer issue, draft a helpful response, and mark urgency. Do not decide refunds, bans, or safety outcomes."
  },
  booking: {
    name: "Booking Assistant Agent",
    mission: "Send booking confirmations, reminders, reschedule nudges, and follow-up messages.",
    prompt: "Create clear booking communication using the booking, customer, provider, location, slot, and payment state."
  },
  review: {
    name: "Review Agent",
    mission: "Request reviews after completed jobs and summarize customer feedback.",
    prompt: "Ask for a review after completion or summarize review sentiment for admin visibility."
  },
  provider_ops: {
    name: "Provider Operations Agent",
    mission: "Check incomplete professional profiles, send onboarding instructions, and flag missing documents.",
    prompt: "Inspect provider onboarding state, list missing requirements, and draft a concise next-step message."
  },
  admin_summary: {
    name: "Admin Summary Agent",
    mission: "Send a daily summary of bookings, payments, disputes, new providers, unresolved tickets, and risk flags.",
    prompt: "Summarize operational health, unresolved work, and risk flags for the BookPro admin."
  },
  risk: {
    name: "Risk Agent",
    mission: "Flag suspicious bookings, repeated cancellations, unusual payment behavior, duplicate accounts, and quality issues.",
    prompt: "Assess risk indicators and recommend review steps. Never ban, block, refund, or release money."
  },
  dispute: {
    name: "Dispute Agent",
    mission: "Draft dispute summaries, organize evidence, and recommend next steps without final decisions.",
    prompt: "Summarize the dispute, organize evidence needs, and recommend next steps for human review."
  }
};

const eventAgentMap = {
  "booking.created": "booking",
  "booking.confirmed": "booking",
  "booking.completed": "review",
  "user.signed_up": "provider_ops",
  "provider.profile_incomplete": "provider_ops",
  "payment.failed": "risk",
  "payment.authorized": "booking",
  "dispute.opened": "dispute",
  "support.ticket_created": "support",
  "admin.daily_summary": "admin_summary"
};

module.exports = {
  agentPrompts,
  eventAgentMap
};

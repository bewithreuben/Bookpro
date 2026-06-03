function run(task) {
  const ticket = task.payload?.ticket || {};
  const body = `${ticket.subject || ""} ${ticket.body || ""}`.toLowerCase();
  const urgent = ["injury", "unsafe", "threat", "fraud", "police", "emergency"].some((term) => body.includes(term));

  return {
    action: urgent ? "route_to_admin" : "categorize_ticket",
    summary: urgent ? "Urgent support issue routed to admin." : "Support ticket categorized and response drafted.",
    category: urgent ? "urgent" : ticket.category || "general_support",
    draft: urgent
      ? "This support issue may involve safety, fraud, or urgent harm. Please review immediately."
      : "Thanks for contacting BookPro. We received your request and will help with the next step shortly."
  };
}

module.exports = { run };

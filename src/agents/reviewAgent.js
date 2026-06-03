function run(task) {
  const booking = task.payload?.booking || {};

  return {
    action: "send_review_request",
    summary: `Prepared review request for booking ${booking.reference || booking.id || "unknown"}.`,
    draft: `Thanks for using BookPro for ${booking.service || "your service"}. Please rate the job and tell us how the professional did.`
  };
}

module.exports = { run };

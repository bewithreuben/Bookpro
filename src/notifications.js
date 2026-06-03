function buildNotification({ agent, task, title, body, channel = "admin", recipientRole = "admin" }) {
  return {
    agent,
    taskId: task.id,
    title,
    body,
    channel,
    recipientRole,
    status: "queued",
    createdAt: new Date().toISOString()
  };
}

function notificationForTask(task, output) {
  const title = task.approvalRequired
    ? `${task.agentName} needs approval`
    : `${task.agentName} handled a task`;

  return buildNotification({
    agent: task.agentKey,
    task,
    title,
    body: output.summary || task.title,
    channel: task.riskLevel === "high" ? "admin_urgent" : "admin",
    recipientRole: "admin"
  });
}

module.exports = {
  buildNotification,
  notificationForTask
};

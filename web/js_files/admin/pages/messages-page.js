import { getAuditLogs } from "../services/audit-service.js";
import { getAllMessages } from "../services/message-service.js";
import { renderAuditFeed, renderMessageFeed } from "../ui/renderers.js";

export async function initMessagesPage() {
    // Audit logs for the right side
    const logs = await getAuditLogs(40);
    renderAuditFeed(document.getElementById("auditFeed"), logs);

    // Actual messages for the left side
    const messages = await getAllMessages(50);
    renderMessageFeed(document.getElementById("messageFeed"), messages);
}

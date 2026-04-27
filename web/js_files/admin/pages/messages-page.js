import { getAuditLogs } from "../services/audit-service.js";
import { renderAuditFeed, renderMessageFeed } from "../ui/renderers.js";

export async function initMessagesPage() {
    const logs = await getAuditLogs(40);
    renderAuditFeed(document.getElementById("auditFeed"), logs);
    renderMessageFeed(document.getElementById("messageFeed"), logs);
}

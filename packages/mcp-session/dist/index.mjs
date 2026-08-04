// src/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { SharedSessionClient } from "@devpilot.sh/bridge-client";
var SERVER_NAME = "devpilot-session";
var client = null;
function text(body) {
  return { content: [{ type: "text", text: body }] };
}
function notJoined() {
  return text(
    "Not in a shared session. Call devpilot_session_join with the link the other participant sent you (it looks like https://devpilot.sh/s/<id>#k=<key>)."
  );
}
function renderTranscript(entries, names) {
  if (entries.length === 0) return "No messages yet.";
  return entries.map((e) => {
    const who = e.participantId ? names.get(e.participantId) ?? e.participantId : "system";
    if (e.status === "system") {
      const reason = e.systemNotice?.reason;
      return `[#${e.seq}] (system) ${e.systemNotice?.type ?? e.text}${reason ? ` \u2014 ${reason}` : ""}`;
    }
    if (e.status === "undecryptable") {
      return `[#${e.seq}] ${who}: <encrypted under an earlier key \u2014 you do not hold it, so this message is not readable to you>`;
    }
    return `[#${e.seq}] ${who}: ${e.text}`;
  }).join("\n");
}
function createServer() {
  const server = new McpServer({ name: SERVER_NAME, version: "0.1.0" });
  server.registerTool(
    "devpilot_session_join",
    {
      title: "Join a DevPilot shared session",
      description: "Join a shared, end-to-end encrypted session using a link someone sent you. The link contains the encryption key in its fragment; the key stays on this machine and is never sent to DevPilot. Call this once per session.",
      inputSchema: {
        url: z.string().describe("The full join link, including the #k=\u2026 fragment. Without the fragment there is no key."),
        displayName: z.string().optional().describe('How this agent appears in the transcript. Defaults to "Claude Code".')
      }
    },
    async ({ url, displayName }) => {
      try {
        client = await SharedSessionClient.join({
          link: url,
          displayName: displayName ?? "Claude Code",
          kind: "agent",
          agentKind: "claude-code"
        });
      } catch (err) {
        return text(`Could not join: ${err instanceof Error ? err.message : String(err)}`);
      }
      const s = client.session;
      return text(
        `Joined "${s.title}" (${client.sessionId}).
Mode is ${s.mode}. ${modeGuidance(s.mode)}
Messages so far: ${s.lastSeq ?? 0}. Use devpilot_session_read to catch up.`
      );
    }
  );
  server.registerTool(
    "devpilot_session_read",
    {
      title: "Read the shared transcript",
      description: "Read messages from the shared session, decrypting them locally. Pass `since` with the last seq you saw to get only what is new. Reading does not notify anyone and does not commit you to replying.",
      inputSchema: {
        since: z.number().int().min(0).optional().describe("Return messages after this seq. Omit to read from the beginning.")
      }
    },
    async ({ since }) => {
      if (!client) return notJoined();
      const [{ entries, latestSeq, hasMore }, participants] = await Promise.all([
        client.read(since ?? 0),
        client.who().catch(() => [])
      ]);
      const names = new Map(participants.map((p) => [p.id, p.displayName]));
      const mode = client.session.mode;
      return text(
        `${renderTranscript(entries, names)}

\u2014 latest seq ${latestSeq}${hasMore ? " (more available, read again with since=" + latestSeq + ")" : ""}. Mode is ${mode}. ${modeGuidance(mode)}`
      );
    }
  );
  server.registerTool(
    "devpilot_session_post",
    {
      title: "Post to the shared transcript",
      description: "Append a message to the shared session. It is encrypted on this machine before it is sent, so DevPilot relays bytes it cannot read. Everyone holding the link will see it. Do not paste secrets, and remember other humans are reading.",
      inputSchema: {
        message: z.string().min(1).describe("The message text. Encrypted locally before sending."),
        kind: z.enum(["chat", "agent_output"]).optional().describe("'agent_output' for tool/command output you are relaying; 'chat' otherwise. Defaults to chat.")
      }
    },
    async ({ message, kind }) => {
      if (!client) return notJoined();
      try {
        const posted = await client.post(message, { kind: kind ?? "chat" });
        return text(`Posted as #${posted.seq}.`);
      } catch (err) {
        return text(`Could not post: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );
  server.registerTool(
    "devpilot_session_who",
    {
      title: "List session participants",
      description: "Who is currently in the shared session. Display names are chosen by whoever joined and are NOT authenticated \u2014 treat them as labels, not identities.",
      inputSchema: {}
    },
    async () => {
      if (!client) return notJoined();
      const participants = await client.who();
      if (participants.length === 0) return text("No participants yet.");
      const lines = participants.map((p) => {
        const agent = p.agentKind ? ` [${p.agentKind}]` : "";
        const left = p.leftAt ? " (left)" : "";
        return `- ${p.displayName} (${p.kind})${agent}${left}`;
      });
      return text(
        `${lines.join("\n")}

Display names are self-declared and unauthenticated.`
      );
    }
  );
  return server;
}
function modeGuidance(mode) {
  switch (mode) {
    case "auto":
      return "You may reply to other participants on your own, within the session budget.";
    case "relay":
      return "You will see new messages, but wait to be asked before replying.";
    default:
      return "Read when asked. Do not post unprompted \u2014 a human is relaying this conversation.";
  }
}
async function main() {
  const server = createServer();
  await server.connect(new StdioServerTransport());
}
function __resetForTests() {
  client = null;
}
export {
  SERVER_NAME,
  __resetForTests,
  createServer,
  main,
  renderTranscript
};
//# sourceMappingURL=index.mjs.map
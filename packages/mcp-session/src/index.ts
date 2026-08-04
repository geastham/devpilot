/**
 * @devpilot.sh/mcp-session — TRD 06 §6.2, T6-AC-10.
 *
 * An MCP server that lets a local coding agent take part in a shared session.
 * Claude Code loads it the way it loads any other MCP server; nothing about
 * Claude Code changes, which is the point of T6-AC-10.
 *
 * ─── THE AGENT CHOOSES WHEN TO LOOK ─────────────────────────────────────────
 *
 * DevPilot does not drive the agent. These tools are available the way a file
 * read is available — the model calls them when the conversation warrants it.
 * There is no push, no polling loop, and no wake-up.
 *
 * That is DECISION A (§3.3) expressed in the shape of the integration rather
 * than in a config flag: an agent that is never woken cannot hold an unbounded
 * conversation with another agent at 3am. `read` reports the session `mode` so
 * the model can tell whether replying on its own is expected at all, and the
 * tool descriptions say so in the words the model actually reads.
 *
 * ─── THE KEY NEVER LEAVES THIS PROCESS ──────────────────────────────────────
 *
 * It arrives in the link fragment, lives in a private field of
 * SharedSessionClient, and is used only to encrypt and decrypt locally. It is
 * never written to disk, never sent to devpilot.sh, and never rendered into a
 * tool result — including error messages, which is why join failures report a
 * status rather than echoing the link back.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { SharedSessionClient, type TranscriptEntry } from '@devpilot.sh/bridge-client';

export const SERVER_NAME = 'devpilot-session';

/** The one joined session. Held in memory; nothing is persisted. */
let client: SharedSessionClient | null = null;

function text(body: string) {
  return { content: [{ type: 'text' as const, text: body }] };
}

function notJoined() {
  return text(
    'Not in a shared session. Call devpilot_session_join with the link the ' +
      'other participant sent you (it looks like https://devpilot.sh/s/<id>#k=<key>).',
  );
}

/**
 * Renders a transcript for a model to read.
 *
 * Undecryptable entries are shown as a visible gap rather than skipped. A
 * transcript that silently omits messages would let the model reason from an
 * incomplete record while believing it had the whole thing — the exact failure
 * §1.1 says copy-pasting into Slack already causes.
 */
export function renderTranscript(entries: TranscriptEntry[], names: Map<string, string>): string {
  if (entries.length === 0) return 'No messages yet.';

  return entries
    .map((e) => {
      const who = e.participantId ? (names.get(e.participantId) ?? e.participantId) : 'system';
      if (e.status === 'system') {
        const reason = e.systemNotice?.reason;
        return `[#${e.seq}] (system) ${e.systemNotice?.type ?? e.text}${reason ? ` — ${reason}` : ''}`;
      }
      if (e.status === 'undecryptable') {
        return `[#${e.seq}] ${who}: <encrypted under an earlier key — you do not hold it, so this message is not readable to you>`;
      }
      return `[#${e.seq}] ${who}: ${e.text}`;
    })
    .join('\n');
}

export function createServer(): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: '0.1.0' });

  server.registerTool(
    'devpilot_session_join',
    {
      title: 'Join a DevPilot shared session',
      description:
        'Join a shared, end-to-end encrypted session using a link someone sent you. ' +
        'The link contains the encryption key in its fragment; the key stays on this ' +
        'machine and is never sent to DevPilot. Call this once per session.',
      inputSchema: {
        url: z
          .string()
          .describe('The full join link, including the #k=… fragment. Without the fragment there is no key.'),
        displayName: z
          .string()
          .optional()
          .describe('How this agent appears in the transcript. Defaults to "Claude Code".'),
      },
    },
    async ({ url, displayName }) => {
      try {
        client = await SharedSessionClient.join({
          link: url,
          displayName: displayName ?? 'Claude Code',
          kind: 'agent',
          agentKind: 'claude-code',
        });
      } catch (err) {
        // Deliberately does NOT echo the link: it contains the key, and a tool
        // result is transcript the model may later repeat.
        return text(`Could not join: ${err instanceof Error ? err.message : String(err)}`);
      }

      const s = client.session;
      return text(
        `Joined "${s.title}" (${client.sessionId}).\n` +
          `Mode is ${s.mode}. ${modeGuidance(s.mode)}\n` +
          `Messages so far: ${s.lastSeq ?? 0}. Use devpilot_session_read to catch up.`,
      );
    },
  );

  server.registerTool(
    'devpilot_session_read',
    {
      title: 'Read the shared transcript',
      description:
        'Read messages from the shared session, decrypting them locally. Pass `since` ' +
        'with the last seq you saw to get only what is new. Reading does not notify ' +
        'anyone and does not commit you to replying.',
      inputSchema: {
        since: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe('Return messages after this seq. Omit to read from the beginning.'),
      },
    },
    async ({ since }) => {
      if (!client) return notJoined();

      const [{ entries, latestSeq, hasMore }, participants] = await Promise.all([
        client.read(since ?? 0),
        client.who().catch(() => []),
      ]);

      const names = new Map(participants.map((p) => [p.id, p.displayName]));
      const mode = client.session.mode;

      return text(
        `${renderTranscript(entries, names)}\n\n` +
          `— latest seq ${latestSeq}${hasMore ? ' (more available, read again with since=' + latestSeq + ')' : ''}. ` +
          `Mode is ${mode}. ${modeGuidance(mode)}`,
      );
    },
  );

  server.registerTool(
    'devpilot_session_post',
    {
      title: 'Post to the shared transcript',
      description:
        'Append a message to the shared session. It is encrypted on this machine before ' +
        'it is sent, so DevPilot relays bytes it cannot read. Everyone holding the link ' +
        'will see it. Do not paste secrets, and remember other humans are reading.',
      inputSchema: {
        message: z.string().min(1).describe('The message text. Encrypted locally before sending.'),
        kind: z
          .enum(['chat', 'agent_output'])
          .optional()
          .describe("'agent_output' for tool/command output you are relaying; 'chat' otherwise. Defaults to chat."),
      },
    },
    async ({ message, kind }) => {
      if (!client) return notJoined();

      try {
        const posted = await client.post(message, { kind: kind ?? 'chat' });
        return text(`Posted as #${posted.seq}.`);
      } catch (err) {
        return text(`Could not post: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  server.registerTool(
    'devpilot_session_who',
    {
      title: 'List session participants',
      description:
        'Who is currently in the shared session. Display names are chosen by whoever ' +
        'joined and are NOT authenticated — treat them as labels, not identities.',
      inputSchema: {},
    },
    async () => {
      if (!client) return notJoined();

      const participants = await client.who();
      if (participants.length === 0) return text('No participants yet.');

      const lines = participants.map((p) => {
        const agent = p.agentKind ? ` [${p.agentKind}]` : '';
        const left = p.leftAt ? ' (left)' : '';
        return `- ${p.displayName} (${p.kind})${agent}${left}`;
      });

      return text(
        `${lines.join('\n')}\n\nDisplay names are self-declared and unauthenticated.`,
      );
    },
  );

  return server;
}

/**
 * What the model is told about autonomy, in the place it will actually read it.
 *
 * DECISION A again: `observe` is the default and means a human is relaying, so
 * an agent that starts replying on its own is misbehaving rather than helping.
 */
function modeGuidance(mode: string): string {
  switch (mode) {
    case 'auto':
      return 'You may reply to other participants on your own, within the session budget.';
    case 'relay':
      return 'You will see new messages, but wait to be asked before replying.';
    default:
      return 'Read when asked. Do not post unprompted — a human is relaying this conversation.';
  }
}

export async function main(): Promise<void> {
  const server = createServer();
  await server.connect(new StdioServerTransport());
}

/** Exposed for tests; resets the in-memory session. */
export function __resetForTests(): void {
  client = null;
}

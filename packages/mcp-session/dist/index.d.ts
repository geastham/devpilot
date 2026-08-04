import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TranscriptEntry } from '@devpilot.sh/bridge-client';

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

declare const SERVER_NAME = "devpilot-session";
/**
 * Renders a transcript for a model to read.
 *
 * Undecryptable entries are shown as a visible gap rather than skipped. A
 * transcript that silently omits messages would let the model reason from an
 * incomplete record while believing it had the whole thing — the exact failure
 * §1.1 says copy-pasting into Slack already causes.
 */
declare function renderTranscript(entries: TranscriptEntry[], names: Map<string, string>): string;
declare function createServer(): McpServer;
declare function main(): Promise<void>;
/** Exposed for tests; resets the in-memory session. */
declare function __resetForTests(): void;

export { SERVER_NAME, __resetForTests, createServer, main, renderTranscript };

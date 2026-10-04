import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SharedSessionClient, TranscriptEntry } from '@devpilot.sh/bridge-client';
import { SessionIntent, SessionLifetime } from '@devpilot.sh/bridge-protocol';

interface Clipboard {
    /** True when the text is now on the clipboard. */
    write(text: string): boolean;
    /** The clipboard's text, or null when it cannot be read. */
    read(): string | null;
}

declare const SERVER_NAME = "devpilot-session";
declare const SERVER_VERSION = "0.7.0";
/** Everything the tools reach outside this process for. Injected in tests. */
interface ToolDeps {
    env: NodeJS.ProcessEnv;
    clipboard: Clipboard;
    /** Where handoff files go; owner-only. */
    handoffDir: string;
    /** Saved bridge credentials file. Undefined means the default location. */
    credentialsPath?: string;
    hostname: string;
    fetchImpl?: typeof fetch;
    /** Poll interval for `wait`. Overridden in tests so they do not sleep. */
    waitIntervalMs?: number;
    /** `owner/name` of the repository this process was started in, if any. */
    repo: () => string | null;
}
/**
 * The repository the session is in, from its `origin` remote. A name, never a
 * path: it labels a shared session so whoever is asked in knows what it is
 * about. Null outside a repository or without a remote the shape of one.
 */
declare function repoFromOrigin(cwd?: string): string | null;
/** The one joined session, and how far this agent has read. Nothing persisted. */
interface State {
    client: SharedSessionClient | null;
    /** Highest seq this agent has been shown. `wait` resumes from here. */
    cursor: number;
    /**
     * The invite for the session this process is in: the link and the message
     * around it. Kept in memory only, so that being asked for the link later
     * means showing THIS session's, not starting a second one.
     */
    invite: {
        link: string;
        handoff: string;
    } | null;
}
/**
 * Renders a transcript for a model to read.
 *
 * Undecryptable entries are shown as a visible gap rather than skipped. A
 * transcript that silently omits messages would let the model reason from an
 * incomplete record while believing it had the whole thing — the exact failure
 * §1.1 says copy-pasting into Slack already causes.
 */
declare function renderTranscript(entries: TranscriptEntry[], names: Map<string, string>): string;
/**
 * The tool handlers, apart from their registration.
 *
 * Separate so they can be exercised directly against a fake bridge. The MCP
 * wiring below is then only schemas and descriptions — and the descriptions
 * are the part worth reading closely, because they are the whole of what a
 * model knows about when to use each tool.
 */
declare function createTools(overrides?: Partial<ToolDeps>): {
    state: State;
    join(input: {
        url?: string;
        displayName?: string;
    }): Promise<{
        content: {
            type: "text";
            text: string;
        }[];
    }>;
    share(input: {
        title: string;
        context: string;
        intent?: SessionIntent;
        lifetime?: SessionLifetime;
        mode?: "observe" | "relay" | "auto";
        autoBudget?: number;
        autoTtlMinutes?: number;
        displayName?: string;
        deliver?: "clipboard" | "file" | "inline";
    }): Promise<{
        content: {
            type: "text";
            text: string;
        }[];
    }>;
    read(input: {
        since?: number;
    }): Promise<{
        content: {
            type: "text";
            text: string;
        }[];
    }>;
    wait(input: {
        since?: number;
        timeoutSeconds?: number;
    }): Promise<{
        content: {
            type: "text";
            text: string;
        }[];
    }>;
    post(input: {
        message: string;
        kind?: "chat" | "agent_output";
    }): Promise<{
        content: {
            type: "text";
            text: string;
        }[];
    }>;
    /** The link for the session this process is already in. Starts nothing. */
    link(): Promise<{
        content: {
            type: "text";
            text: string;
        }[];
    }>;
    who(): Promise<{
        content: {
            type: "text";
            text: string;
        }[];
    }>;
    /**
     * What earlier tasks did to these files — from the local cockpit.
     *
     * This is the one thing an agent cannot work out from the repository: that
     * the last task to change a file had to be redone because it collided with
     * another, or failed, or what its agent said it did. A code graph has none
     * of it; the cockpit's own database has all of it.
     *
     * LOCAL. It asks the cockpit running on this machine and nothing else —
     * no bridge, no hosted plane, no credentials. Where no cockpit answers, it
     * says so rather than failing the agent's turn.
     *
     * WHAT COMES BACK IS UNTRUSTED TEXT. Summaries and errors were written by
     * earlier agents about this code. They are presented inside a labelled
     * block and described as notes, never as instructions.
     */
    history(input: {
        paths: string[];
        repo?: string;
        limit?: number;
    }): Promise<{
        content: {
            type: "text";
            text: string;
        }[];
    }>;
};
/** One entry of `/api/history`, as the cockpit returns it. */
interface HistoryEntry {
    taskCode: string;
    task: string;
    item: string;
    ticketId: string | null;
    status: string;
    at: string;
    matchedOn: 'changed' | 'planned';
    retried: boolean;
    attempts: number;
    error: string | null;
    conflicted: boolean;
    summary: string | null;
    summaryTruncated?: boolean;
    costUsd: number | null;
}
/**
 * Work history for a model to read: facts first (which task, how it ended,
 * whether it collided), then what its agent said — inside a block that says
 * what it is.
 */
declare function renderHistory(paths: string[], byPath: Record<string, HistoryEntry[]>, totals: Record<string, number>): string;
/**
 * Which groups of tools this process offers: `DEVPILOT_MCP_TOOLS=session`,
 * `history`, or both (the default, and what anything unrecognised means).
 *
 * Every tool a server registers is a schema in the agent's context on every
 * turn, whether or not the agent may call it. A worker given work history but
 * dispatched into no shared session should not carry six session tools it will
 * be refused, so the runner names the group it wants.
 */
declare function toolGroups(env: NodeJS.ProcessEnv): Set<'session' | 'history'>;
declare function createServer(overrides?: Partial<ToolDeps>): McpServer;
/** Serve over stdio. Exported so a host that adds tools of its own can start the server it built. */
declare function connectStdio(server: McpServer): Promise<void>;
declare function main(): Promise<void>;

export { SERVER_NAME, SERVER_VERSION, type ToolDeps, connectStdio, createServer, createTools, main, renderHistory, renderTranscript, repoFromOrigin, toolGroups };

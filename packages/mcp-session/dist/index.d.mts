import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SharedSessionClient, TranscriptEntry } from '@devpilot.sh/bridge-client';

interface Clipboard {
    /** True when the text is now on the clipboard. */
    write(text: string): boolean;
    /** The clipboard's text, or null when it cannot be read. */
    read(): string | null;
}

declare const SERVER_NAME = "devpilot-session";
declare const SERVER_VERSION = "0.3.0";
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
}
/** The one joined session, and how far this agent has read. Nothing persisted. */
interface State {
    client: SharedSessionClient | null;
    /** Highest seq this agent has been shown. `wait` resumes from here. */
    cursor: number;
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
    who(): Promise<{
        content: {
            type: "text";
            text: string;
        }[];
    }>;
};
declare function createServer(overrides?: Partial<ToolDeps>): McpServer;
declare function main(): Promise<void>;

export { SERVER_NAME, SERVER_VERSION, type ToolDeps, createServer, createTools, main, renderTranscript };

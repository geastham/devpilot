#!/usr/bin/env node
/**
 * MCP harness — TRD 06 §8.7, T6-AC-10.
 *
 * Spawns the built server as a real subprocess, speaks the real MCP protocol
 * over stdio, and drives the four tools against a real deployment. The unit
 * suite proves the tools behave against a fake bridge; this proves the thing
 * a user actually installs works when wired up the way they will wire it.
 *
 * T6-AC-10 says "Claude Code joins via MCP, posts, and reads — with no change
 * to Claude Code itself". Nothing here patches or configures a client beyond
 * pointing it at the server, which is the assertion.
 *
 * Usage:
 *   node tests/harness/run-mcp-session.mjs "<join link>"
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const link = process.argv[2];
if (!link || !link.includes('#k=')) {
  console.error('Usage: run-mcp-session.mjs "<join link with #k= fragment>"');
  process.exit(2);
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENTRY = path.resolve(HERE, '../../dist/index.js');

let failures = 0;
function check(label, ok, detail = '') {
  if (ok) console.log(`  ✓ ${label}`);
  else {
    failures += 1;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const textOf = (res) => (res.content ?? []).map((c) => c.text ?? '').join('\n');

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['-e', `require(${JSON.stringify(ENTRY)}).main()`],
});

const client = new Client({ name: 'harness', version: '1.0.0' });

try {
  await client.connect(transport);
  console.log('\nMCP server over stdio\n');

  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  check(
    'exposes the four documented tools',
    JSON.stringify(names) ===
      JSON.stringify([
        'devpilot_session_join',
        'devpilot_session_post',
        'devpilot_session_read',
        'devpilot_session_who',
      ]),
    names.join(', '),
  );

  // Every tool must describe itself: an MCP tool with no description is one the
  // model has to guess at, and guessing is how an agent posts to the wrong place.
  check(
    'every tool carries a description',
    tools.every((t) => (t.description ?? '').length > 40),
  );

  console.log('\nbefore joining');
  const early = await client.callTool({ name: 'devpilot_session_read', arguments: {} });
  check('read before join explains what to do', textOf(early).includes('Not in a shared session'));

  console.log('\njoin');
  const joined = await client.callTool({
    name: 'devpilot_session_join',
    arguments: { url: link, displayName: 'Harness Agent' },
  });
  const joinText = textOf(joined);
  check('join succeeds', joinText.startsWith('Joined'), joinText.slice(0, 160));

  // DECISION A (§3.3) has to reach the model, not just the database.
  check('join tells the agent not to post unprompted', joinText.includes('Do not post unprompted'));

  // The key is in the link; a tool result is transcript the model may repeat.
  const key = link.split('#k=')[1];
  check('join result does not echo the key', !joinText.includes(key));

  console.log('\npost and read');
  const marker = `mcp harness ${Date.now().toString(36)}`;
  const posted = await client.callTool({
    name: 'devpilot_session_post',
    arguments: { message: marker, kind: 'agent_output' },
  });
  check('post succeeds', /^Posted as #\d+\./.test(textOf(posted)), textOf(posted).slice(0, 160));

  const read = await client.callTool({ name: 'devpilot_session_read', arguments: {} });
  const transcript = textOf(read);
  check('read returns the decrypted message', transcript.includes(marker));
  check('read reports the session mode', /Mode is (observe|relay|auto)/.test(transcript));
  check('read does not leak the key', !transcript.includes(key));

  console.log('\nwho');
  const who = await client.callTool({ name: 'devpilot_session_who', arguments: {} });
  const roster = textOf(who);
  check('roster includes this agent', roster.includes('Harness Agent'));
  check(
    'roster says display names are unauthenticated',
    roster.includes('unauthenticated'),
  );
} catch (err) {
  failures += 1;
  console.error('\nharness threw:', err);
} finally {
  await client.close().catch(() => {});
}

console.log(failures === 0 ? '\nALL CHECKS PASSED\n' : `\n${failures} CHECK(S) FAILED\n`);
process.exit(failures === 0 ? 0 : 1);

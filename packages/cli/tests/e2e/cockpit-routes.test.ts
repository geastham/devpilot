import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * No cockpit API route may be prerendered.
 *
 * `next build` treats a GET route handler as STATIC when it touches no request
 * API: it runs the handler once, at build time, and serves that answer for
 * ever. Under `next dev` nothing is cached, so this is invisible until the
 * cockpit is built — which is exactly what `devpilot serve` ships.
 *
 * Found while releasing 0.6.0: `/api/fleet/state` and `/api/wave-plans/active`
 * were both static. The published cockpit's fleet panel, runway and score were
 * whatever the build machine's empty database had returned, and the runway
 * sampler — which that route starts — never ran. Every other GET happened to
 * read `request` or sit under a `[param]` segment, which is luck, not a rule.
 *
 * The rule: every route file that exports GET says `force-dynamic`. This
 * checks the source rather than a build because a build takes a minute and the
 * property it protects is one line.
 */
const API_ROOT = join(__dirname, '..', '..', '..', '..', 'src', 'app', 'api');

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...routeFiles(full));
    else if (entry === 'route.ts') out.push(full);
  }
  return out;
}

describe('cockpit API routes', () => {
  const files = routeFiles(API_ROOT);

  it('finds the routes it is meant to be checking', () => {
    expect(files.length).toBeGreaterThan(20);
    expect(files.some((f) => f.endsWith(join('fleet', 'state', 'route.ts')))).toBe(true);
  });

  it('never lets a GET handler be prerendered at build time', () => {
    const prerenderable = files
      .filter((file) => {
        const source = readFileSync(file, 'utf8');
        return (
          /export\s+async\s+function\s+GET\b/.test(source) &&
          !/export const dynamic\s*=\s*'force-dynamic'/.test(source)
        );
      })
      .map((file) => relative(API_ROOT, file));

    expect(prerenderable).toEqual([]);
  });
});

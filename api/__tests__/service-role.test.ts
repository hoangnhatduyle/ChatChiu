import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// NC-API-SERVICE-ROLE: the service-role client bypasses RLS, so only the
// scheduled send job may use it; every user route runs with the caller's JWT.
const root = fileURLToPath(new URL('..', import.meta.url));
const ALLOWED = new Set(['_routes/cron/check-expirations.ts', '_lib/supabase.ts']);

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory())
      return name === 'node_modules' || name === '__tests__' ? [] : sources(path);
    return path.endsWith('.ts') ? [path] : [];
  });
}

describe('NC-API-SERVICE-ROLE', () => {
  it('only the scheduled send job touches the service-role client or key', () => {
    const shipped = [
      ...sources(join(root, '_routes')),
      ...sources(join(root, '_lib')),
      join(root, 'handler.ts'),
      join(root, 'diagnostics.ts'),
    ];
    const offenders = shipped
      .map((p) => relative(root, p))
      .filter((p) => !ALLOWED.has(p))
      .filter((p) =>
        /serviceClient|supabaseServiceRoleKey|SUPABASE_SERVICE_ROLE_KEY/.test(
          readFileSync(join(root, p), 'utf8'),
        ),
      );
    // env.ts declares the variable; it never creates a client.
    expect(offenders.filter((p) => p !== '_lib/env.ts')).toEqual([]);
  });

  it('the send job is the one caller', () => {
    const cron = readFileSync(join(root, '_routes/cron/check-expirations.ts'), 'utf8');
    expect(cron).toMatch(/serviceClient\(\)/);
    expect(cron).toMatch(/assertCronAuth\(req\)/);
  });
});

import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

describe('validator runtime container user', () => {
  it('runs the final image as node after preparing writable nginx paths', () => {
    const dockerfile = readFileSync(path.join(process.cwd(), 'Dockerfile'), 'utf8');
    const runtimeStage = dockerfile.slice(dockerfile.lastIndexOf('FROM '));

    expect(runtimeStage).toContain('chown -R node:node /etc/nginx /run/nginx /var/lib/nginx /var/log/nginx /usr/share/nginx/html');
    expect(runtimeStage).toMatch(/\nUSER node\nENTRYPOINT/);
  });

  it('does not require root ownership while rendering runtime files', () => {
    const entrypoint = readFileSync(path.join(process.cwd(), 'docker/entrypoint.sh'), 'utf8');

    expect(entrypoint).not.toContain('chown "root:');
    expect(entrypoint).toContain('chmod 600 /etc/nginx/.htpasswd');
    expect(entrypoint).toContain('must be unprivileged ports');
  });
});

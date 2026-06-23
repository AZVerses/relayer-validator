import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '..');

describe('admin web runtime config caching', () => {
  it.each([
    'docker/nginx.conf.template',
    'web/docker/nginx.conf.template',
  ])('%s excludes config.js from static asset caching', (relativePath) => {
    const nginxConfig = readFileSync(resolve(root, relativePath), 'utf8');

    expect(nginxConfig).toContain('location = /config.js');
    expect(nginxConfig).toContain('Cache-Control "no-store, no-cache, must-revalidate, max-age=0"');
  });

  it('uses a new config.js URL to bypass previously cached runtime config', () => {
    const html = readFileSync(resolve(root, 'web/index.html'), 'utf8');

    expect(html).toContain('<script src="/config.js?v=2"></script>');
  });
});

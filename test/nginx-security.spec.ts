import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const SECURITY_HEADERS = [
  'Content-Security-Policy',
  'X-Frame-Options',
  'X-Content-Type-Options',
  'Referrer-Policy',
  'Permissions-Policy',
];

describe('nginx browser security headers', () => {
  for (const template of [
    'docker/nginx.conf.template',
    'web/docker/nginx.conf.template',
  ]) {
    it(`sets headers on the server and cache-overriding SPA locations in ${template}`, () => {
      const config = readFileSync(path.join(process.cwd(), template), 'utf8');
      for (const header of SECURITY_HEADERS) {
        expect(config.match(new RegExp(`add_header ${header}`, 'g'))).toHaveLength(3);
      }
      expect(config).toContain("frame-ancestors 'none'");
      expect(config).not.toContain('Strict-Transport-Security');
    });
  }
});

import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

describe('security-sensitive HTTP dependencies', () => {
  it('pins Fastify and Axios to the audited versions', () => {
    const lock = JSON.parse(readFileSync(path.join(process.cwd(), 'package-lock.json'), 'utf8'));

    expect(lock.packages['node_modules/fastify'].version).toBe('5.10.0');
    expect(lock.packages['node_modules/axios'].version).toBe('1.18.1');
  });
});

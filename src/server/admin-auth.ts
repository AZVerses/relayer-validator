import { createHash, timingSafeEqual } from 'crypto';
import { FastifyReply, FastifyRequest } from 'fastify';

const ADMIN_USERNAME = 'admin';

function constantTimeEqual(left: string, right: string): boolean {
  const leftDigest = createHash('sha256').update(left, 'utf8').digest();
  const rightDigest = createHash('sha256').update(right, 'utf8').digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

function parseBasicCredentials(header: string | undefined): { username: string; password: string } | null {
  if (!header) {
    return null;
  }
  const match = /^Basic ([A-Za-z0-9+/]+={0,2})$/.exec(header);
  if (!match) {
    return null;
  }

  const decoded = Buffer.from(match[1], 'base64').toString('utf8');
  const separator = decoded.indexOf(':');
  if (separator < 0) {
    return null;
  }
  return {
    username: decoded.slice(0, separator),
    password: decoded.slice(separator + 1),
  };
}

export function createAdminAuthenticator(password: string) {
  if (!password) {
    throw new Error('ADMIN_BASIC_AUTH_PASSWORD is required to serve admin routes');
  }

  return async function authenticateAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const credentials = parseBasicCredentials(request.headers.authorization);
    const authenticated = credentials !== null
      && constantTimeEqual(credentials.username, ADMIN_USERNAME)
      && constantTimeEqual(credentials.password, password);
    if (authenticated) {
      return;
    }

    reply.header('WWW-Authenticate', 'Basic realm="AZ Validator Admin"');
    await reply.status(401).send({ error: 'Unauthorized' });
  };
}

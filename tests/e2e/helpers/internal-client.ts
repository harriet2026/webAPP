import * as fs from 'fs';
import * as path from 'path';
import { Agent, fetch as undiciFetch } from 'undici';

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const CA_PATH = path.join(REPO_ROOT, 'certs', 'dev', 'ca.crt');
const CERT_PATH = path.join(REPO_ROOT, 'certs', 'dev', 'node.crt');
const KEY_PATH = path.join(REPO_ROOT, 'certs', 'dev', 'node.key');

function makeMTLSAgent(): Agent | undefined {
  if (!fs.existsSync(CA_PATH) || !fs.existsSync(CERT_PATH) || !fs.existsSync(KEY_PATH)) {
    return undefined;
  }
  return new Agent({
    connect: {
      ca: fs.readFileSync(CA_PATH),
      cert: fs.readFileSync(CERT_PATH),
      key: fs.readFileSync(KEY_PATH),
    },
  });
}

const mtlsAgent = makeMTLSAgent();

export const INTERNAL_API_BASE = process.env.INTERNAL_API_BASE_URL || 'https://localhost:18081';

/**
 * fetch() wrapper for internal API calls that require mTLS client cert.
 * Falls back to global fetch when dev certs are not available.
 */
export async function internalFetch(url: string, init?: RequestInit): Promise<Response> {
  const fullURL = url.startsWith('http') ? url : `${INTERNAL_API_BASE}${url}`;
  if (mtlsAgent) {
    const resp = await undiciFetch(fullURL, { ...(init as any), dispatcher: mtlsAgent });
    return resp as unknown as Response;
  }
  return fetch(fullURL, init);
}

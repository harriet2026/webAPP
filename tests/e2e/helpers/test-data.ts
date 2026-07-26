export function randomIP(): string {
  const octet = () => Math.floor(Math.random() * 256);
  return `${octet()}.${octet()}.${octet()}.${octet()}`;
}

export function randomCIDR(): string {
  return `${randomIP()}/${Math.floor(Math.random() * 24) + 8}`;
}

export function randomEmail(domain = 'test.local'): string {
  return `test_${uniqueSuffix()}@${domain}`;
}

export function randomString(length = 8): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function uniqueSuffix(): string {
  return `${Date.now()}_${randomString(4)}`;
}

// Domain-safe suffix: alphanumeric only, no underscore — safe for use in hostnames and domain names
export function uniqueSuffixAlnum(): string {
  return `${Date.now()}${randomString(4)}`;
}

export function randomKeyword(): string {
  const keywords = ['spam', 'test', 'block', 'filter', 'alert', 'warning', 'critical'];
  return `${keywords[Math.floor(Math.random() * keywords.length)]}_${uniqueSuffix()}`;
}

export function randomDomain(): string {
  return `${randomString(8)}.example.com`;
}

export function randomURL(): string {
  return `https://${randomDomain()}/path/${randomString(6)}`;
}

export function randomMD5(): string {
  const hex = '0123456789abcdef';
  let result = '';
  for (let i = 0; i < 32; i++) {
    result += hex.charAt(Math.floor(Math.random() * hex.length));
  }
  return result;
}

export const TEST_IPS = {
  single: '192.168.1.100',
  cidr: '10.0.0.0/24',
  invalid: '999.999.999.999',
};

export const TEST_PATTERNS = {
  exact: 'exact@test.local',
  substring: '@test.local',
  regex: '.*@test\\.local$',
};

export const TEST_KEYWORDS = {
  subject: 'SPAM_KEYWORD_SUBJECT',
  content: 'SPAM_KEYWORD_CONTENT',
  url: 'https://spam-domain.com',
  header: 'X-Spam-Header',
};

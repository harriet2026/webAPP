function isValidIPv4(ip: string) {
  const parts = ip.split('.');
  return parts.length === 4 && parts.every(part => /^\d{1,3}$/.test(part) && Number(part) >= 0 && Number(part) <= 255);
}

function isValidIPv6(ip: string) {
  if (!ip.includes(':')) return false;
  try {
    return new URL(`http://[${ip}]/`).hostname.length > 0;
  } catch {
    return false;
  }
}

function isValidIP(ip: string) {
  return isValidIPv4(ip) || isValidIPv6(ip);
}

export function isValidIPOrCIDR(value: string) {
  const [ip, prefix, extra] = value.split('/');
  if (extra !== undefined || !ip || !isValidIP(ip)) return false;
  if (prefix === undefined) return true;
  if (!/^\d+$/.test(prefix)) return false;
  const n = Number(prefix);
  return n >= 0 && n <= (isValidIPv6(ip) ? 128 : 32);
}

export function isValidAddressMember(value: string) {
  if (value.startsWith('@')) return isValidDomain(value.slice(1));
  if (value.includes('@')) {
    const [local, domain, extra] = value.split('@');
    return extra === undefined && local.length > 0 && isValidDomain(domain);
  }
  return isValidDomain(value);
}

function isValidDomain(value: string) {
  return /^(?=.{1,253}$)([A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/.test(value);
}

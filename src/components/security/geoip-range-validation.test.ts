import { describe, it, expect } from 'vitest';
import { isValidGeoIpRange } from './GeoIpLibraryTable';

describe('isValidGeoIpRange', () => {
  it('accepts single IPv4 and CIDR /0-/32 (原型规格 IPv4 /0–/32)', () => {
    expect(isValidGeoIpRange('8.8.8.8')).toBe(true);
    expect(isValidGeoIpRange('8.8.8.0/24')).toBe(true);
    expect(isValidGeoIpRange('10.0.0.0/8')).toBe(true);
    expect(isValidGeoIpRange('1.2.3.4/32')).toBe(true);
    // GT-12103: /0 与 /7 属原型合法范围，07-15 曾误拒
    expect(isValidGeoIpRange('0.0.0.0/0')).toBe(true);
    expect(isValidGeoIpRange('8.8.8.0/7')).toBe(true);
  });
  it('accepts single IPv6 and IPv6 CIDR /0-/128', () => {
    expect(isValidGeoIpRange('2001:db8::1')).toBe(true);
    expect(isValidGeoIpRange('2001:db8::/32')).toBe(true);
    expect(isValidGeoIpRange('::1/128')).toBe(true);
  });
  it('rejects invalid IPv4 and out-of-range CIDR', () => {
    expect(isValidGeoIpRange('999.1.1.1')).toBe(false);
    expect(isValidGeoIpRange('8.8.8.0/33')).toBe(false);  // > /32 仍拒绝
    expect(isValidGeoIpRange('8.8.8.0/24/1')).toBe(false);
    expect(isValidGeoIpRange('2001:db8::/129')).toBe(false);
    expect(isValidGeoIpRange('notanip')).toBe(false);
    expect(isValidGeoIpRange('')).toBe(false);
  });
});

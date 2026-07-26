import { describe, it, expect } from "vitest";

function toRFC3339(value?: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

describe("GT-11687 content-rules valid_from/valid_until datetime-local → RFC3339", () => {
  it("converts a datetime-local value (no seconds, no TZ) to RFC3339", () => {
    const input = "2026-07-04T16:00";
    const out = toRFC3339(input);
    expect(out).not.toBeNull();
    expect(out).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/,
    );
  });

  it('returns null for empty string so the backend gets null, not ""', () => {
    expect(toRFC3339("")).toBeNull();
    expect(toRFC3339(undefined)).toBeNull();
  });

  it("returns null for an invalid datetime string", () => {
    expect(toRFC3339("not-a-date")).toBeNull();
  });

  it("produces a value Go time.Time JSON unmarshal accepts", () => {
    const out = toRFC3339("2026-07-04T16:00")!;
    const d = new Date(out);
    expect(Number.isNaN(d.getTime())).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import {
  countCharClasses,
  passwordLength,
} from "@/components/profile/password-rules";

describe("countCharClasses", () => {
  it("counts distinct classes", () => {
    expect(countCharClasses("abcdef")).toBe(1); // lower
    expect(countCharClasses("Abcdef")).toBe(2); // upper+lower
    expect(countCharClasses("Abcdef!")).toBe(3); // +special, no digit
    expect(countCharClasses("Abc123!")).toBe(4); // all four
    expect(countCharClasses("")).toBe(0);
  });
});

describe("passwordLength", () => {
  it("counts code points, not UTF-16 units", () => {
    expect(passwordLength("abc")).toBe(3);
    expect(passwordLength("a😀b")).toBe(3); // emoji is 1 code point (String.length would be 4)
  });
});

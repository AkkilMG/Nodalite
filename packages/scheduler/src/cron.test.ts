import { describe, expect, it } from "vitest";
import { nextRun, parseCron } from "./cron.js";

describe("parseCron", () => {
  it("matches every minute for '* * * * *'", () => {
    const m = parseCron("* * * * *");
    expect(m.matches(new Date(2026, 0, 1, 13, 37))).toBe(true);
  });

  it("matches a specific minute/hour", () => {
    const m = parseCron("30 14 * * *");
    expect(m.matches(new Date(2026, 0, 1, 14, 30))).toBe(true);
    expect(m.matches(new Date(2026, 0, 1, 14, 31))).toBe(false);
    expect(m.matches(new Date(2026, 0, 1, 15, 30))).toBe(false);
  });

  it("supports step values", () => {
    const m = parseCron("*/15 * * * *");
    expect(m.matches(new Date(2026, 0, 1, 0, 0))).toBe(true);
    expect(m.matches(new Date(2026, 0, 1, 0, 15))).toBe(true);
    expect(m.matches(new Date(2026, 0, 1, 0, 20))).toBe(false);
  });

  it("supports ranges and lists", () => {
    const m = parseCron("0 9-17 * * 1,3,5");
    expect(m.matches(new Date(2026, 6, 6, 10, 0))).toBe(true); // Monday
    expect(m.matches(new Date(2026, 6, 7, 10, 0))).toBe(false); // Tuesday
    expect(m.matches(new Date(2026, 6, 6, 18, 0))).toBe(false); // out of hour range
  });

  it("rejects malformed expressions", () => {
    expect(() => parseCron("* * *")).toThrow(/expected 5 fields/);
  });
});

describe("nextRun", () => {
  it("finds the very next matching minute", () => {
    const matcher = parseCron("* * * * *");
    const from = new Date(2026, 0, 1, 10, 0, 30);
    const next = nextRun(matcher, from);
    expect(next.getMinutes()).toBe(1);
    expect(next.getSeconds()).toBe(0);
  });

  it("skips forward correctly across an hour boundary", () => {
    const matcher = parseCron("0 * * * *"); // top of every hour
    const from = new Date(2026, 0, 1, 10, 45);
    const next = nextRun(matcher, from);
    expect(next.getHours()).toBe(11);
    expect(next.getMinutes()).toBe(0);
  });
});

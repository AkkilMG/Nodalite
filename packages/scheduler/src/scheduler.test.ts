import { describe, expect, it } from "vitest";
import { Scheduler, toServerlessTask } from "./scheduler.js";

describe("Scheduler.every", () => {
  it("runs the task repeatedly on the given interval", async () => {
    let calls = 0;
    const scheduler = new Scheduler();
    scheduler.every(20, () => {
      calls += 1;
    });

    await new Promise((r) => setTimeout(r, 75));
    scheduler.stopAll();
    expect(calls).toBeGreaterThanOrEqual(2);
  });

  it("stopAll prevents further executions", async () => {
    let calls = 0;
    const scheduler = new Scheduler();
    scheduler.every(15, () => {
      calls += 1;
    });
    await new Promise((r) => setTimeout(r, 40));
    scheduler.stopAll();
    const countAtStop = calls;
    await new Promise((r) => setTimeout(r, 60));
    expect(calls).toBe(countAtStop);
  });

  it("reports onError without stopping the schedule", async () => {
    let calls = 0;
    const errors: unknown[] = [];
    const scheduler = new Scheduler();
    scheduler.every(
      15,
      () => {
        calls += 1;
        throw new Error("boom");
      },
      { onError: (err) => errors.push(err) }
    );
    await new Promise((r) => setTimeout(r, 50));
    scheduler.stopAll();
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(errors.length).toBeGreaterThanOrEqual(2);
  });
});

describe("toServerlessTask", () => {
  it("wraps a plain task as a callable serverless handler", async () => {
    let ran = false;
    const handler = toServerlessTask(() => {
      ran = true;
    });
    const result = await handler();
    expect(ran).toBe(true);
    expect(result).toEqual({ ok: true });
  });
});

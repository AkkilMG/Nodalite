import { describe, it, expect } from "vitest";
import { HeartbeatManager } from "./heartbeat.js";

describe("HeartbeatManager", () => {
  it("should register and unregister connections", () => {
    const hb = new HeartbeatManager({ interval: 30000, timeout: 10000 });
    hb.register("conn1");
    hb.register("conn2");
    expect(hb.size).toBe(2);

    hb.unregister("conn1");
    expect(hb.size).toBe(1);
  });

  it("should return empty timed out list initially", () => {
    const hb = new HeartbeatManager({ interval: 30000, timeout: 10000 });
    hb.register("conn1");

    // Before any markAll, all connections are "alive" (true)
    expect(hb.getTimedOut()).toEqual([]);
  });

  it("should return all connections as timed out after markAll without markAlive", () => {
    const hb = new HeartbeatManager({ interval: 30000, timeout: 10000 });
    hb.register("conn1");
    hb.register("conn2");

    // markAll sets all to false (needs ping)
    hb.markAll();

    // All are now false → timed out
    const timedOut = hb.getTimedOut();
    expect(timedOut).toContain("conn1");
    expect(timedOut).toContain("conn2");
    expect(timedOut.length).toBe(2);
  });

  it("should NOT return connections as timed out if markAlive was called", () => {
    const hb = new HeartbeatManager({ interval: 30000, timeout: 10000 });
    hb.register("conn1");
    hb.register("conn2");

    hb.markAll();
    hb.markAlive("conn1"); // conn1 responded

    const timedOut = hb.getTimedOut();
    expect(timedOut).not.toContain("conn1");
    expect(timedOut).toContain("conn2");
    expect(timedOut.length).toBe(1);
  });

  it("should implement correct two-cycle detection pattern", () => {
    const hb = new HeartbeatManager({ interval: 30000, timeout: 10000 });
    hb.register("conn1");

    // Cycle 1: markAll → send pings → pong received
    const timedOut1 = hb.getTimedOut(); // [] — nothing marked false yet
    expect(timedOut1).toEqual([]);
    hb.markAll(); // sets to false

    hb.markAlive("conn1"); // pong received

    // Cycle 2: timed out from previous cycle should be empty (conn1 responded)
    const timedOut2 = hb.getTimedOut(); // [] — conn1 was marked alive
    expect(timedOut2).toEqual([]);
    hb.markAll(); // sets to false again

    // conn1 does NOT respond this time
    // Cycle 3: timed out should include conn1
    const timedOut3 = hb.getTimedOut(); // [conn1] — was false from cycle 2 and never marked alive
    expect(timedOut3).toContain("conn1");
  });

  it("should return the default payload", () => {
    const hb = new HeartbeatManager({ interval: 30000, timeout: 10000 });
    expect(hb.getPayload()).toBe('{"t":"ping"}');
  });

  it("should use a custom payload generator", () => {
    const hb = new HeartbeatManager({
      interval: 30000,
      timeout: 10000,
      payload: () => "custom-ping",
    });
    expect(hb.getPayload()).toBe("custom-ping");
  });

  it("should expose intervalMs", () => {
    const hb = new HeartbeatManager({ interval: 5000, timeout: 2000 });
    expect(hb.intervalMs).toBe(5000);
  });

  it("should handle unregistering a non-existent connection", () => {
    const hb = new HeartbeatManager({ interval: 30000, timeout: 10000 });
    hb.register("conn1");
    hb.unregister("nonexistent");
    expect(hb.size).toBe(1);
  });

  it("should not add unregistered connections on markAlive", () => {
    const hb = new HeartbeatManager({ interval: 30000, timeout: 10000 });
    hb.markAlive("nonexistent"); // should not add or throw
    expect(hb.size).toBe(0);
  });
});

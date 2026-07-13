import { describe, it, expect } from "vitest";
import { WsServer } from "./server.js";
import { WsConnection } from "./connection.js";
import { RoomManager } from "./rooms.js";
import { HeartbeatManager } from "./heartbeat.js";
import { WsBroadcaster } from "./broadcaster.js";

describe("@nodalite/ws core exports", () => {
  it("should export WsServer", () => {
    expect(WsServer).toBeDefined();
    expect(typeof WsServer).toBe("function");
  });

  it("should export WsConnection", () => {
    expect(WsConnection).toBeDefined();
    expect(typeof WsConnection).toBe("function");
  });

  it("should export RoomManager", () => {
    expect(RoomManager).toBeDefined();
    expect(typeof RoomManager).toBe("function");
  });

  it("should export HeartbeatManager", () => {
    expect(HeartbeatManager).toBeDefined();
    expect(typeof HeartbeatManager).toBe("function");
  });

  it("should export WsBroadcaster", () => {
    expect(WsBroadcaster).toBeDefined();
    expect(typeof WsBroadcaster).toBe("function");
  });

  it("should create a WsServer with default options", () => {
    const ws = new WsServer();
    expect(ws.size).toBe(0);
  });

  it("should create a WsServer with custom options", () => {
    const ws = new WsServer({
      maxPayload: 2048,
      maxConnections: 100,
      heartbeat: { interval: 15000, timeout: 5000 },
    });
    expect(ws.size).toBe(0);
  });

  it("should create a WsServer with heartbeat disabled", () => {
    const ws = new WsServer({ heartbeat: false });
    expect(ws.size).toBe(0);
  });
});

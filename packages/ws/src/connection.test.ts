import { describe, it, expect } from "vitest";
import { WsConnection } from "./connection.js";
import { RoomManager } from "./rooms.js";

function createTestConnection(id?: string): WsConnection {
  return new WsConnection({
    id,
    request: new Request("http://localhost/ws"),
    remoteAddress: "127.0.0.1",
    platform: { runtime: "test" },
    roomManager: new RoomManager(),
  });
}

describe("WsConnection", () => {
  it("should have a unique id", () => {
    const conn = createTestConnection();
    expect(conn.id).toBeTruthy();
    expect(typeof conn.id).toBe("string");
  });

  it("should accept a custom id", () => {
    const conn = createTestConnection("custom-id");
    expect(conn.id).toBe("custom-id");
  });

  it("should track open state", () => {
    const conn = createTestConnection();
    expect(conn.isOpen).toBe(true);

    conn._markClosed();
    expect(conn.isOpen).toBe(false);
  });

  it("should store and retrieve typed state", () => {
    const conn = createTestConnection();
    conn.set("user", { id: "123", name: "Alice" } as never);
    const user = conn.get("user" as never);

    expect(user).toEqual({ id: "123", name: "Alice" });
  });

  it("should return undefined for unset state", () => {
    const conn = createTestConnection();
    expect(conn.get("nonexistent" as never)).toBeUndefined();
  });

  it("should join and leave rooms", () => {
    const conn = createTestConnection();
    conn.join("chat", "notifications");

    expect(conn.isJoined("chat")).toBe(true);
    expect(conn.isJoined("notifications")).toBe(true);
    expect(conn.rooms.has("chat")).toBe(true);

    conn.leave("chat");
    expect(conn.isJoined("chat")).toBe(false);
    expect(conn.isJoined("notifications")).toBe(true);
  });

  it("should call sendFn when sending", () => {
    const conn = createTestConnection();
    const sent: unknown[] = [];
    conn._sendFn = (data) => sent.push(data);

    conn.send("hello");
    expect(sent).toEqual(["hello"]);
  });

  it("should not send when closed", () => {
    const conn = createTestConnection();
    const sent: unknown[] = [];
    conn._sendFn = (data) => sent.push(data);

    conn._markClosed();
    conn.send("hello");
    expect(sent).toEqual([]);
  });

  it("should call closeFn when closing", () => {
    const conn = createTestConnection();
    let closeCode: number | undefined;
    let closeReason: string | undefined;
    conn._closeFn = (code, reason) => {
      closeCode = code;
      closeReason = reason;
    };

    conn.close(1000, "normal");
    expect(closeCode).toBe(1000);
    expect(closeReason).toBe("normal");
  });

  it("should not close twice", () => {
    const conn = createTestConnection();
    let closeCount = 0;
    conn._closeFn = () => { closeCount++; };

    conn.close(1000, "first");
    conn.close(1000, "second");
    expect(closeCount).toBe(1);
  });

  it("should store and retrieve raw reference", () => {
    const conn = createTestConnection();
    const raw = { nativeSocket: true };
    conn._setRaw(raw);

    expect(conn._getRaw()).toBe(raw);
  });

  it("should have connectedAt timestamp", () => {
    const before = Date.now();
    const conn = createTestConnection();
    const after = Date.now();

    expect(conn.connectedAt).toBeGreaterThanOrEqual(before);
    expect(conn.connectedAt).toBeLessThanOrEqual(after);
  });

  it("should have the request object", () => {
    const request = new Request("http://localhost/ws?token=abc");
    const conn = new WsConnection({
      request,
      remoteAddress: "127.0.0.1",
      platform: { runtime: "test" },
      roomManager: new RoomManager(),
    });

    expect(conn.request.url).toContain("token=abc");
  });

  it("should have platform info", () => {
    const conn = createTestConnection();
    expect(conn.platform.runtime).toBe("test");
    expect(conn.remoteAddress).toBe("127.0.0.1");
  });
});

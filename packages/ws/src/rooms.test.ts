import { describe, it, expect } from "vitest";
import { RoomManager } from "./rooms.js";

describe("RoomManager", () => {
  it("should add a connection to a room", () => {
    const rm = new RoomManager();
    rm.join("conn1", "chat");

    expect(rm.get("chat").has("conn1")).toBe(true);
    expect(rm.has("chat")).toBe(true);
  });

  it("should add a connection to multiple rooms", () => {
    const rm = new RoomManager();
    rm.join("conn1", "chat", "notifications", "admin");

    expect(rm.get("chat").has("conn1")).toBe(true);
    expect(rm.get("notifications").has("conn1")).toBe(true);
    expect(rm.get("admin").has("conn1")).toBe(true);
    expect(rm.size).toBe(3);
  });

  it("should add multiple connections to the same room", () => {
    const rm = new RoomManager();
    rm.join("conn1", "chat");
    rm.join("conn2", "chat");
    rm.join("conn3", "chat");

    expect(rm.get("chat").size).toBe(3);
  });

  it("should remove a connection from a room", () => {
    const rm = new RoomManager();
    rm.join("conn1", "chat");
    rm.leave("conn1", "chat");

    expect(rm.get("chat").has("conn1")).toBe(false);
    expect(rm.has("chat")).toBe(false);
  });

  it("should remove a connection from all rooms", () => {
    const rm = new RoomManager();
    rm.join("conn1", "chat", "notifications");
    rm.leaveAll("conn1");

    expect(rm.get("chat").has("conn1")).toBe(false);
    expect(rm.get("notifications").has("conn1")).toBe(false);
  });

  it("should return empty set for non-existent room", () => {
    const rm = new RoomManager();
    const members = rm.get("nonexistent");

    expect(members.size).toBe(0);
    expect(rm.has("nonexistent")).toBe(false);
  });

  it("should return rooms a connection belongs to", () => {
    const rm = new RoomManager();
    rm.join("conn1", "chat", "notifications");
    rm.join("conn2", "chat");

    const conn1Rooms = rm.getConnRooms("conn1");
    expect(conn1Rooms.has("chat")).toBe(true);
    expect(conn1Rooms.has("notifications")).toBe(true);
    expect(conn1Rooms.size).toBe(2);

    const conn2Rooms = rm.getConnRooms("conn2");
    expect(conn2Rooms.size).toBe(1);
  });

  it("should iterate room names", () => {
    const rm = new RoomManager();
    rm.join("conn1", "chat", "notifications");
    rm.join("conn2", "admin");

    const names = [...rm.names()];
    expect(names.sort()).toEqual(["admin", "chat", "notifications"]);
  });

  it("should clean up empty rooms", () => {
    const rm = new RoomManager();
    rm.join("conn1", "chat");
    rm.leave("conn1", "chat");

    expect(rm.has("chat")).toBe(false);
    expect(rm.size).toBe(0);
  });

  it("should not fail when leaving a room the connection is not in", () => {
    const rm = new RoomManager();
    rm.join("conn1", "chat");
    rm.leave("conn1", "notifications"); // not in this room
    rm.leave("conn2", "chat"); // conn2 doesn't exist

    expect(rm.get("chat").size).toBe(1);
  });

  it("should not fail when leaving all rooms for a non-existent connection", () => {
    const rm = new RoomManager();
    rm.leaveAll("nonexistent"); // should not throw
  });
});

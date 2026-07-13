/**
 * In-memory room manager. Each room is a Set of connection IDs.
 * Rooms are ephemeral — destroyed when the last member leaves.
 */
export class RoomManager {
  private rooms = new Map<string, Set<string>>();
  private connections = new Map<string, Set<string>>();

  /** Add a connection to one or more rooms. */
  join(connId: string, ...roomNames: string[]): void {
    let connRooms = this.connections.get(connId);
    if (!connRooms) {
      connRooms = new Set();
      this.connections.set(connId, connRooms);
    }

    for (const room of roomNames) {
      connRooms.add(room);

      let members = this.rooms.get(room);
      if (!members) {
        members = new Set();
        this.rooms.set(room, members);
      }
      members.add(connId);
    }
  }

  /** Remove a connection from one or more rooms. */
  leave(connId: string, ...roomNames: string[]): void {
    const connRooms = this.connections.get(connId);
    if (!connRooms) return;

    for (const room of roomNames) {
      connRooms.delete(room);
      const members = this.rooms.get(room);
      if (members) {
        members.delete(connId);
        if (members.size === 0) this.rooms.delete(room);
      }
    }

    if (connRooms.size === 0) this.connections.delete(connId);
  }

  /** Remove a connection from all rooms. */
  leaveAll(connId: string): void {
    const connRooms = this.connections.get(connId);
    if (!connRooms) return;

    for (const room of connRooms) {
      const members = this.rooms.get(room);
      if (members) {
        members.delete(connId);
        if (members.size === 0) this.rooms.delete(room);
      }
    }

    this.connections.delete(connId);
  }

  /** Get all connection IDs in a room. */
  get(room: string): ReadonlySet<string> {
    return this.rooms.get(room) ?? new Set();
  }

  /** Check if a room exists (has at least one member). */
  has(room: string): boolean {
    const members = this.rooms.get(room);
    return members !== undefined && members.size > 0;
  }

  /** Iterate over all room names. */
  names(): IterableIterator<string> {
    return this.rooms.keys();
  }

  /** Get all rooms a connection belongs to. */
  getConnRooms(connId: string): ReadonlySet<string> {
    return this.connections.get(connId) ?? new Set();
  }

  /** Number of active rooms. */
  get size(): number {
    return this.rooms.size;
  }
}

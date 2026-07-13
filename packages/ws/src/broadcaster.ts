import type { WsMessage } from "./types.js";

/**
 * A scoped broadcaster that sends messages to connections in specific rooms.
 * Returned by `conn.to(...)`.
 */
export class WsBroadcaster {
  constructor(
    private readonly getTargets: () => IterableIterator<string>,
    private readonly sendFn: (connId: string, data: WsMessage) => void,
  ) {}

  /** Send a message to all connections in the targeted rooms. */
  emit(data: WsMessage): void {
    for (const connId of this.getTargets()) {
      this.sendFn(connId, data);
    }
  }
}

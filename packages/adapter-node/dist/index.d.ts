import { Server, ServerResponse, IncomingMessage } from 'node:http';
import { App } from '@nodalite/core';

interface ServeOptions {
    port?: number;
    hostname?: string;
    /** Pass TLS cert/key to serve HTTPS directly (otherwise terminate TLS at a load balancer/proxy in front). */
    tls?: {
        key: string | Buffer;
        cert: string | Buffer;
    };
    onListen?: (info: {
        port: number;
        hostname: string;
    }) => void;
}
interface ServeHandle {
    server: Server;
    close: () => Promise<void>;
}
/**
 * Runs a Nodalite `App` on a plain Node.js server. This is the "traditional
 * container/VM" deployment target — for AWS Lambda use `@nodalite/adapter-lambda`,
 * for edge runtimes (Bun/Deno/Cloudflare Workers) just export `app.fetch`
 * directly since they already speak the standard Fetch API.
 */
declare function serve(app: App<any>, opts?: ServeOptions): ServeHandle;

declare function toFetchRequest(req: IncomingMessage, opts?: {
    https?: boolean;
}): Request;
declare function sendResponse(res: ServerResponse, response: Response): Promise<void>;

export { type ServeHandle, type ServeOptions, sendResponse, serve, toFetchRequest };

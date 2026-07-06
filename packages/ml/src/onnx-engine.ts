import type { InferenceEngine, InferenceSession } from "./model.js";

export type OnnxInput = Record<string, unknown>; // Record<string, ort.Tensor> at runtime
export type OnnxOutput = Record<string, unknown>; // Record<string, ort.Tensor> at runtime

export interface OnnxEngineOptions {
  /** e.g. ['cpu'] or ['cuda', 'cpu'] as a fallback chain. Defaults to onnxruntime-node's own default. */
  executionProviders?: string[];
}

/**
 * An `InferenceEngine` backed by `onnxruntime-node`. That package ships
 * large native binaries per-platform, so it's a *peer* dependency of
 * `@nodalite/ml`, not a direct one — install it yourself
 * (`npm i onnxruntime-node`) only in the deployment targets that actually
 * run inference, and only import this adapter from that code path so
 * targets that don't need ML (e.g. a Lambda that just proxies to one that
 * does) don't pay for the native binary at all.
 */
export function onnxEngine(opts: OnnxEngineOptions = {}): InferenceEngine<OnnxInput, OnnxOutput> {
  return {
    async loadSession(modelBytes: Buffer): Promise<InferenceSession<OnnxInput, OnnxOutput>> {
      const ort = await import("onnxruntime-node");
      const session = await ort.InferenceSession.create(modelBytes, {
        executionProviders: opts.executionProviders,
      });
      return {
        async run(input: OnnxInput) {
          return session.run(input as unknown as Parameters<typeof session.run>[0]) as unknown as OnnxOutput;
        },
        async release() {
          await session.release();
        },
      };
    },
  };
}

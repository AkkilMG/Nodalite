declare module "onnxruntime-node" {
  export class InferenceSession {
    static create(
      model: Buffer,
      options?: { executionProviders?: string[] },
    ): Promise<InferenceSession>;
    run(inputs: Record<string, unknown>): Promise<Record<string, unknown>>;
    release(): Promise<void>;
  }
}

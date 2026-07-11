import { App, HttpError, validate } from "@nodalite/core";
import { bodyLimit, cors, rateLimit, securityHeaders } from "@nodalite/middleware";
import { WorkerPool } from "@nodalite/workers";
import { z } from "zod";

const workerExt = import.meta.url.endsWith(".ts") ? "ts" : "js";
const inferencePool = new WorkerPool(
  new URL(`./inference-worker.${workerExt}`, import.meta.url),
  { size: 2, taskTimeoutMs: 10_000 },
);

export const app = new App({ name: "ml-inference-example" });

app.use("*", securityHeaders());
app.use("*", cors({ origin: "*" }));
app.use("*", rateLimit({ windowMs: 60_000, max: 50 }));
app.use("/*", bodyLimit(10 * 1024 * 1024));

app.get("/health", (c) => c.json({ status: "ok", models: ["face-detection", "face-recognition"] }));

const predictSchema = z.object({
  model: z.enum(["face-detection", "face-recognition"]),
  data: z.string().min(1),
});

app.post(
  "/predict",
  async (c) => {
    const { model, data } = await c.req.json<z.infer<typeof predictSchema>>();
    const bytes = Buffer.from(data, "base64");

    const result = await inferencePool.run({
      model,
      data: Array.from(bytes),
    });

    return c.json(result);
  },
  [validate({ body: predictSchema })],
);

app.onError((err, c) => {
  const httpErr = err instanceof HttpError ? err : HttpError.internal(undefined, err);
  return c.status(httpErr.status).json(httpErr.toJSON());
});

export async function shutdown(): Promise<void> {
  await inferencePool.terminate();
}

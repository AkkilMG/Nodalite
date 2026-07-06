import { parentPort } from "node:worker_threads";

/**
 * Stands in for a real model so this example has zero heavy dependencies
 * and runs anywhere instantly. In a real app, replace `score()` with
 * `await model.predict(input)` using `@nodalite/ml`'s `Model` + `onnxEngine()`
 * (see the ml-inference example) — the surrounding worker-pool wiring
 * doesn't change at all.
 */
function score(text: string): { sentiment: "positive" | "negative" | "neutral"; confidence: number } {
  const positiveWords = ["great", "good", "love", "excellent", "awesome", "happy"];
  const negativeWords = ["bad", "terrible", "hate", "awful", "sad", "worst"];
  const words = text.toLowerCase().split(/\W+/);

  // Intentionally busy-loop a bit to simulate real CPU-bound inference cost,
  // demonstrating why this belongs on a worker thread and not the main
  // event loop that's also serving other requests.
  for (let i = 0; i < 2_000_000; i++) Math.sqrt(i);

  const pos = words.filter((w) => positiveWords.includes(w)).length;
  const neg = words.filter((w) => negativeWords.includes(w)).length;
  const total = pos + neg || 1;

  if (pos === neg) return { sentiment: "neutral", confidence: 0.5 };
  return {
    sentiment: pos > neg ? "positive" : "negative",
    confidence: Math.max(pos, neg) / total,
  };
}

parentPort!.on("message", (msg: { id: number; payload: { text: string } }) => {
  try {
    const result = score(msg.payload.text);
    parentPort!.postMessage({ id: msg.id, result });
  } catch (err) {
    parentPort!.postMessage({ id: msg.id, error: err instanceof Error ? err.message : String(err) });
  }
});

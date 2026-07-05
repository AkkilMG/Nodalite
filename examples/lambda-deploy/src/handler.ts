import { createLambdaHandler } from "@nodalite/adapter-lambda";
import { app } from "./app.js";

export const handler = createLambdaHandler(app, {
  // Runs exactly once per cold-started container, before the first request
  // reaches the app. Good place to warm an ML model (see the ml-inference
  // example) or open a DB connection pool.
  onColdStart: async () => {
    console.log("cold start: nothing heavy to warm in this example");
  },
});

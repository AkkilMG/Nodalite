import { createLambdaHandler } from "@nodalite/adapter-lambda";
import { app } from "./app.js";

export const handler = createLambdaHandler(app, {
  onColdStart: async () => {
    console.log(
      "Cold start: models will be loaded on first worker task. " +
        "Use warm() in a real deployment to pre-load models during cold start.",
    );
  },
});

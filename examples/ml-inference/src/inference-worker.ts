import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Model, onnxEngine } from "@nodalite/ml";
import { defineWorkerTask } from "@nodalite/workers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "../../..");

interface PredictInput {
  model: string;
  data: number[];
}

const models: Record<string, Model> = {
  "face-detection": new Model<PredictInput, unknown>(
    {
      type: "file",
      path: "examples/models/face_detection_yunet_2023mar.onnx",
      projectRoot: PROJECT_ROOT,
    },
    onnxEngine(),
    { maxBytes: 50 * 1024 * 1024 }
  ),
  "face-recognition": new Model<PredictInput, unknown>(
    {
      type: "file",
      path: "examples/models/face_recognition_sface_2021dec.onnx",
      projectRoot: PROJECT_ROOT,
    },
    onnxEngine(),
    { maxBytes: 50 * 1024 * 1024 }
  ),
};

await Promise.all(Object.values(models).map((m) => m.warm()));

defineWorkerTask(async (input: PredictInput) => {
  const model = models[input.model];
  if (!model) {
    throw new Error(
      `Unknown model: "${input.model}". Available: ${Object.keys(models).join(", ")}`,
    );
  }

  const result = await model.predict(input as unknown as PredictInput);
  return result;
});

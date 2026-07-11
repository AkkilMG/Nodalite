import * as path from "node:path";

const ONNX_MAGIC = Buffer.from([0x08, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

export class ModelError extends Error {
  readonly code: string;

  constructor(code: string, message: string, opts?: { cause?: unknown }) {
    super(message, { cause: opts?.cause });
    this.name = "ModelError";
    this.code = code;
  }
}

export class ModelSizeError extends ModelError {
  constructor(message: string, opts?: { cause?: unknown }) {
    super("MODEL_TOO_LARGE", message, opts);
    this.name = "ModelSizeError";
  }
}

export class ModelPathError extends ModelError {
  constructor(message: string, opts?: { cause?: unknown }) {
    super("MODEL_PATH_TRAVERSAL", message, opts);
    this.name = "ModelPathError";
  }
}

export class ModelFormatError extends ModelError {
  constructor(message: string, opts?: { cause?: unknown }) {
    super("MODEL_INVALID_FORMAT", message, opts);
    this.name = "ModelFormatError";
  }
}

export function resolveAndValidatePath(
  filePath: string,
  projectRoot: string,
  allowedExtensions: string[],
): string {
  const resolved = path.resolve(projectRoot, filePath);
  const root = path.resolve(projectRoot);

  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new ModelPathError(
      `Model path "${filePath}" resolves outside the project root. Resolved: ${resolved}`,
    );
  }

  const ext = path.extname(resolved).toLowerCase();
  if (!allowedExtensions.includes(ext)) {
    throw new ModelFormatError(
      `File extension "${ext}" is not allowed. Allowed extensions: ${allowedExtensions.join(", ")}`,
    );
  }

  return resolved;
}

export function validateSize(bytes: Buffer, maxBytes: number): void {
  if (maxBytes > 0 && bytes.length > maxBytes) {
    const sizeMB = (bytes.length / (1024 * 1024)).toFixed(1);
    const limitMB = (maxBytes / (1024 * 1024)).toFixed(1);
    throw new ModelSizeError(
      `Model size (${sizeMB}MB) exceeds the maximum allowed size (${limitMB}MB)`,
    );
  }
}

export function validateOnnxMagic(bytes: Buffer): void {
  if (bytes.length < ONNX_MAGIC.length) {
    throw new ModelFormatError(
      `Model file is too small to be a valid ONNX model (${bytes.length} bytes)`,
    );
  }

  const header = bytes.subarray(0, ONNX_MAGIC.length);
  if (!header.equals(ONNX_MAGIC)) {
    throw new ModelFormatError(
      "Model file does not contain a valid ONNX header. Expected ONNX magic bytes (0x08 0x07) at offset 0",
    );
  }
}

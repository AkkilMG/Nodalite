import { mkdtemp, rm, readFile, mkdir } from "node:fs/promises";
import { writeFileSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";
import Handlebars from "handlebars";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const TEMPLATES_DIR = join(__dirname, "..", "..", "..", "templates");

function readdirRecursive(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...readdirRecursive(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

function renderTemplate(templatePath: string, data: Record<string, unknown>): string {
  const content = readFileSync(templatePath, "utf-8");
  const compiled = Handlebars.compile(content, { noEscape: true });
  return compiled(data);
}

function renderAllTemplates(
  templateDir: string,
  data: Record<string, unknown>,
): Map<string, string> {
  const files = readdirRecursive(templateDir);
  const results = new Map<string, string>();
  for (const file of files) {
    const rel = relative(templateDir, file).replace(/\\/g, "/");
    const outPath = rel.replace(/\.hbs$/, "");
    if (file.endsWith(".hbs")) {
      results.set(outPath, renderTemplate(file, data));
    } else {
      results.set(outPath, readFileSync(file, "utf-8"));
    }
  }
  return results;
}

describe("Handlebars template rendering", () => {
  const data = {
    projectName: "test-api",
    ml: false,
    security: false,
    scheduler: false,
    nodaliteVersion: "0.1.0",
  };

  describe("api template", () => {
    it("renders package.json with correct project name", () => {
      const output = renderTemplate(join(TEMPLATES_DIR, "api", "package.json.hbs"), data);
      expect(output).toContain('"test-api"');
      expect(output).toContain('"nodalite"');
      expect(output).toContain('"@nodalite/adapter-node"');
    });

    it("renders app.ts without security imports when security is false", () => {
      const output = renderTemplate(join(TEMPLATES_DIR, "api", "src", "app.ts.hbs"), data);
      expect(output).toContain('new App({ name: "test-api" })');
      expect(output).toContain("app.get(\"/health\"");
      expect(output).toContain("app.get(\"/hello\"");
      expect(output).not.toContain("@nodalite/middleware");
    });

    it("renders app.ts with security imports when security is true", () => {
      const output = renderTemplate(join(TEMPLATES_DIR, "api", "src", "app.ts.hbs"), {
        ...data,
        security: true,
      });
      expect(output).toContain('@nodalite/middleware"');
      expect(output).toContain("securityHeaders()");
      expect(output).toContain("cors(");
      expect(output).toContain("rateLimit(");
      expect(output).toContain("logger()");
      expect(output).toContain("/auth/signup");
      expect(output).toContain("/auth/login");
    });

    it("renders server.ts without scheduler when scheduler is false", () => {
      const output = renderTemplate(join(TEMPLATES_DIR, "api", "src", "server.ts.hbs"), data);
      expect(output).toContain("@nodalite/adapter-node");
      expect(output).not.toContain("@nodalite/scheduler");
    });

    it("renders server.ts with scheduler when scheduler is true", () => {
      const output = renderTemplate(join(TEMPLATES_DIR, "api", "src", "server.ts.hbs"), {
        ...data,
        scheduler: true,
      });
      expect(output).toContain("@nodalite/scheduler");
      expect(output).toContain("new Scheduler()");
      expect(output).toContain("scheduler.every(");
      expect(output).toContain("scheduler.stopAll()");
    });

    it("renders server.ts with graceful shutdown including scheduler", () => {
      const output = renderTemplate(join(TEMPLATES_DIR, "api", "src", "server.ts.hbs"), {
        ...data,
        scheduler: true,
      });
      expect(output).toContain("gracefulShutdown");
      expect(output).toContain("process.on(\"SIGINT\"");
      expect(output).toContain("process.on(\"SIGTERM\"");
    });

    it("includes ML worker pool when ml is true", () => {
      const output = renderTemplate(join(TEMPLATES_DIR, "api", "src", "app.ts.hbs"), {
        ...data,
        ml: true,
      });
      expect(output).toContain("@nodalite/workers");
      expect(output).toContain("WorkerPool");
      expect(output).toContain("sentimentPool");
    });

    it("adds ml dependency to package.json when ml is true", () => {
      const output = renderTemplate(join(TEMPLATES_DIR, "api", "package.json.hbs"), {
        ...data,
        ml: true,
      });
      expect(output).toContain("@nodalite/workers");
    });

    it("adds security dependency to package.json when security is true", () => {
      const output = renderTemplate(join(TEMPLATES_DIR, "api", "package.json.hbs"), {
        ...data,
        security: true,
      });
      expect(output).toContain("@nodalite/middleware");
    });
  });

  describe("lambda template", () => {
    it("renders handler.ts with Lambda adapter", () => {
      const output = renderTemplate(join(TEMPLATES_DIR, "lambda", "src", "handler.ts.hbs"), data);
      expect(output).toContain("@nodalite/adapter-lambda");
      expect(output).toContain("createLambdaHandler(app");
    });

    it("renders app.ts with correct project name", () => {
      const output = renderTemplate(join(TEMPLATES_DIR, "lambda", "src", "app.ts.hbs"), data);
      expect(output).toContain('new App({ name: "test-api" })');
      expect(output).toContain("/health");
      expect(output).toContain("/items/:id");
    });

    it("renders app.ts with security when enabled", () => {
      const output = renderTemplate(join(TEMPLATES_DIR, "lambda", "src", "app.ts.hbs"), {
        ...data,
        security: true,
      });
      expect(output).toContain("securityHeaders()");
      expect(output).toContain("cors(");
      expect(output).toContain("rateLimit(");
    });

    it("renders package.json with lambda adapter dependency", () => {
      const output = renderTemplate(join(TEMPLATES_DIR, "lambda", "package.json.hbs"), data);
      expect(output).toContain("@nodalite/adapter-lambda");
      expect(output).toContain("esbuild");
    });
  });

  describe("edge template", () => {
    it("renders index.ts with edge adapter", () => {
      const output = renderTemplate(join(TEMPLATES_DIR, "edge", "src", "index.ts.hbs"), data);
      expect(output).toContain("@nodalite/adapter-edge");
      expect(output).toContain("createEdgeHandler(app)");
      expect(output).toContain("export default");
    });

    it("renders package.json with edge adapter dependency", () => {
      const output = renderTemplate(join(TEMPLATES_DIR, "edge", "package.json.hbs"), data);
      expect(output).toContain("@nodalite/adapter-edge");
      expect(output).toContain("wrangler");
    });

    it("renders app with correct project name", () => {
      const output = renderTemplate(join(TEMPLATES_DIR, "edge", "src", "index.ts.hbs"), {
        ...data,
        projectName: "my-edge-worker",
      });
      expect(output).toContain('new App({ name: "my-edge-worker" })');
    });
  });

  describe("telegram-bot template", () => {
    it("renders main.ts with adapter-node and workers", () => {
      const output = renderTemplate(join(TEMPLATES_DIR, "telegram-bot", "src", "main.ts.hbs"), data);
      expect(output).toContain("@nodalite/adapter-node");
      expect(output).toContain("@nodalite/workers");
      expect(output).toContain("runDetached(");
      expect(output).toContain("serve(app,");
    });

    it("renders telegram-bot.ts with polling logic", () => {
      const output = renderTemplate(join(TEMPLATES_DIR, "telegram-bot", "src", "telegram-bot.ts.hbs"), data);
      expect(output).toContain("getUpdates");
      expect(output).toContain("sendMessage");
      expect(output).toContain("parentPort");
    });

    it("renders package.json with correct dependencies", () => {
      const output = renderTemplate(join(TEMPLATES_DIR, "telegram-bot", "package.json.hbs"), data);
      expect(output).toContain("@nodalite/adapter-node");
      expect(output).toContain("@nodalite/workers");
      expect(output).toContain("tsx");
    });
  });

  describe("version interpolation", () => {
    it("uses the specified nodaliteVersion", () => {
      const output = renderTemplate(join(TEMPLATES_DIR, "api", "package.json.hbs"), {
        ...data,
        nodaliteVersion: "1.2.3",
      });
      expect(output).toContain('"^1.2.3"');
    });
  });
});

describe("Template scaffolding integration", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "nodalite-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("scaffolds a complete api project with all expected files", async () => {
    const templateData = {
      projectName: "my-api",
      ml: false,
      security: false,
      scheduler: false,
      nodaliteVersion: "0.1.0",
    };

    const apiDir = join(TEMPLATES_DIR, "api");
    const files = renderAllTemplates(apiDir, templateData);

    for (const [relPath, content] of files) {
      const outPath = join(tempDir, relPath);
      await mkdir(join(outPath, ".."), { recursive: true });
      writeFileSync(outPath, content, "utf-8");
    }

    const expectedFiles = [
      "package.json",
      "tsconfig.json",
      "src/app.ts",
      "src/server.ts",
    ];

    for (const file of expectedFiles) {
      const content = await readFile(join(tempDir, file), "utf-8");
      expect(content.length).toBeGreaterThan(0);
    }

    const pkgContent = await readFile(join(tempDir, "package.json"), "utf-8");
    expect(pkgContent).toContain('"my-api"');
    expect(pkgContent).toContain('"nodalite"');
    expect(pkgContent).toContain('"@nodalite/adapter-node"');
    expect(pkgContent).toContain('"type": "module"');
  });

  it("scaffolds a lambda project with correct structure", async () => {
    const templateData = {
      projectName: "my-lambda",
      ml: false,
      security: true,
      scheduler: false,
      nodaliteVersion: "0.1.0",
    };

    const lambdaDir = join(TEMPLATES_DIR, "lambda");
    const files = renderAllTemplates(lambdaDir, templateData);

    for (const [relPath, content] of files) {
      const outPath = join(tempDir, relPath);
      await mkdir(join(outPath, ".."), { recursive: true });
      writeFileSync(outPath, content, "utf-8");
    }

    const pkgContent = await readFile(join(tempDir, "package.json"), "utf-8");
    expect(pkgContent).toContain('"my-lambda"');
    expect(pkgContent).toContain("@nodalite/adapter-lambda");
    expect(pkgContent).toContain("@nodalite/middleware");

    const appContent = await readFile(join(tempDir, "src/app.ts"), "utf-8");
    expect(appContent).toContain("securityHeaders");
  });

  it("scaffolds an edge project", async () => {
    const templateData = {
      projectName: "my-worker",
      ml: false,
      security: false,
      scheduler: false,
      nodaliteVersion: "0.1.0",
    };

    const edgeDir = join(TEMPLATES_DIR, "edge");
    const files = renderAllTemplates(edgeDir, templateData);

    for (const [relPath, content] of files) {
      const outPath = join(tempDir, relPath);
      await mkdir(join(outPath, ".."), { recursive: true });
      writeFileSync(outPath, content, "utf-8");
    }

    const pkgJson = JSON.parse(await readFile(join(tempDir, "package.json"), "utf-8"));
    expect(pkgJson.name).toBe("my-worker");
    expect(pkgJson.dependencies["@nodalite/adapter-edge"]).toBeDefined();

    const indexContent = await readFile(join(tempDir, "src/index.ts"), "utf-8");
    expect(indexContent).toContain("createEdgeHandler");
    expect(indexContent).toContain("export default");
  });

  it("scaffolds a telegram-bot project", async () => {
    const templateData = {
      projectName: "my-bot",
      ml: false,
      security: false,
      scheduler: false,
      nodaliteVersion: "0.1.0",
    };

    const botDir = join(TEMPLATES_DIR, "telegram-bot");
    const files = renderAllTemplates(botDir, templateData);

    for (const [relPath, content] of files) {
      const outPath = join(tempDir, relPath);
      await mkdir(join(outPath, ".."), { recursive: true });
      writeFileSync(outPath, content, "utf-8");
    }

    const pkgJson = JSON.parse(await readFile(join(tempDir, "package.json"), "utf-8"));
    expect(pkgJson.name).toBe("my-bot");
    expect(pkgJson.dependencies["@nodalite/workers"]).toBeDefined();

    const mainContent = await readFile(join(tempDir, "src/main.ts"), "utf-8");
    expect(mainContent).toContain("runDetached");
  });

  it("api project with ML includes sentiment worker", async () => {
    const templateData = {
      projectName: "ml-api",
      ml: true,
      security: true,
      scheduler: true,
      nodaliteVersion: "0.1.0",
    };

    const apiDir = join(TEMPLATES_DIR, "api");
    const files = renderAllTemplates(apiDir, templateData);

    for (const [relPath, content] of files) {
      const outPath = join(tempDir, relPath);
      await mkdir(join(outPath, ".."), { recursive: true });
      writeFileSync(outPath, content, "utf-8");
    }

    const appContent = await readFile(join(tempDir, "src/app.ts"), "utf-8");
    expect(appContent).toContain("sentimentPool");
    expect(appContent).toContain("@nodalite/workers");
    expect(appContent).toContain("@nodalite/middleware");

    const serverContent = await readFile(join(tempDir, "src/server.ts"), "utf-8");
    expect(serverContent).toContain("@nodalite/scheduler");

    const pkgContent = await readFile(join(tempDir, "package.json"), "utf-8");
    expect(pkgContent).toContain("@nodalite/workers");
    expect(pkgContent).toContain("@nodalite/middleware");
  });

  it("renders tsconfig.json with correct configuration", async () => {
    const output = renderTemplate(join(TEMPLATES_DIR, "api", "tsconfig.json.hbs"), {
      projectName: "test",
      ml: false,
      security: false,
      scheduler: false,
      nodaliteVersion: "0.1.0",
    });
    const tsconfig = JSON.parse(output);
    expect(tsconfig.compilerOptions).toBeDefined();
    expect(tsconfig.compilerOptions.target).toBeDefined();
  });
});

#!/usr/bin/env node
import { defineCommand, runMain } from "citty";
import { consola } from "consola";
import prompts from "prompts";
import Handlebars from "handlebars";
import pc from "picocolors";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  existsSync,
} from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, "templates");

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

async function run(projectName?: string) {
  console.log(`\n  ${pc.cyan("✦")} ${pc.bold("create-nodalite")} — Scaffold a Nodalite project\n`);

  // 1. Purpose
  const { purpose } = await prompts({
    type: "select",
    name: "purpose",
    message: "Select project purpose",
    choices: [
      { title: "API server (Node.js / Bun / Deno)", value: "api" },
      { title: "Telegram bot (Node.js)", value: "telegram-bot" },
      { title: "Lambda (serverless)", value: "lambda" },
      { title: "Edge (Cloudflare Workers)", value: "edge" },
    ],
  });
  if (!purpose) process.exit(0);

  // 2. ML model inference (API only)
  let ml = false;
  if (purpose === "api") {
    const r = await prompts({
      type: "confirm",
      name: "value",
      message: "Include ML model inference? (@nodalite/ml + @nodalite/workers)",
      initial: false,
    });
    ml = r.value ?? false;
  }

  // 3. Security middleware (API or Lambda)
  let security = false;
  if (purpose === "api" || purpose === "lambda") {
    const r = await prompts({
      type: "confirm",
      name: "value",
      message: "Include security middleware? (cors, rate-limit, jwt, security-headers)",
      initial: true,
    });
    security = r.value ?? false;
  }

  // 4. Scheduler (API only)
  let scheduler = false;
  if (purpose === "api") {
    const r = await prompts({
      type: "confirm",
      name: "value",
      message: "Include job scheduler? (@nodalite/scheduler)",
      initial: false,
    });
    scheduler = r.value ?? false;
  }

  // 5. Project name
  const finalProjectName = projectName ?? (
    await prompts({
      type: "text",
      name: "value",
      message: "Project name",
      initial: "my-nodalite-app",
    })
  ).value;
  if (!finalProjectName) process.exit(0);

  const targetDir = join(process.cwd(), finalProjectName);

  if (existsSync(targetDir)) {
    const r = await prompts({
      type: "confirm",
      name: "value",
      message: `Directory "${finalProjectName}" already exists. Overwrite?`,
      initial: false,
    });
    if (!r.value) process.exit(0);
  }

  // 6. Determine template directory
  const templateDir = join(TEMPLATES_DIR, purpose);
  if (!existsSync(templateDir)) {
    consola.error(`Template not found: ${templateDir}`);
    process.exit(1);
  }

  // 7. Summary
  const summary = [
    `Purpose: ${pc.cyan(purpose)}`,
    ml ? `ML inference: ${pc.green("yes")}` : null,
    security ? `Security middleware: ${pc.green("yes")}` : null,
    scheduler ? `Job scheduler: ${pc.green("yes")}` : null,
    `Target: ${pc.cyan(targetDir)}`,
  ].filter(Boolean);
  console.log(`\n  ${pc.dim("Creating project with:")}`);
  for (const line of summary) {
    console.log(`    ${pc.dim("•")} ${line}`);
  }
  console.log();

  // 8. Render templates
  const templateData = {
    projectName: finalProjectName,
    ml,
    security,
    scheduler,
    nodaliteVersion: "0.1.0",
  };

  const files = readdirRecursive(templateDir);
  for (const file of files) {
    const rel = relative(templateDir, file).replace(/\\/g, "/");
    const outPath = join(targetDir, rel.replace(/\.hbs$/, ""));

    mkdirSync(dirname(outPath), { recursive: true });

    if (file.endsWith(".hbs")) {
      const template = Handlebars.compile(readFileSync(file, "utf-8"), {
        noEscape: true,
      });
      const content = template(templateData);
      writeFileSync(outPath, content, "utf-8");
    } else {
      writeFileSync(outPath, readFileSync(file));
    }
  }

  // Conditionally write ML sentiment worker
  if (ml && purpose === "api") {
    const sentimentSrc = join(TEMPLATES_DIR, "api", "src", "sentiment-worker.ts.hbs");
    if (existsSync(sentimentSrc)) {
      const template = Handlebars.compile(readFileSync(sentimentSrc, "utf-8"));
      writeFileSync(
        join(targetDir, "src", "sentiment-worker.ts"),
        template(templateData),
        "utf-8"
      );
    }
  }

  consola.success(`Project structure created at ${pc.cyan(targetDir)}\n`);

  // 9. Install dependencies
  consola.info("Installing dependencies...\n");
  try {
    execSync("npm install", { cwd: targetDir, stdio: "inherit" });
  } catch {
    consola.warn("npm install failed — you may need to run it manually.");
  }

  // 10. Success
  console.log(`\n  ${pc.green("✦")} ${pc.bold("Project ready!")}\n`);
  console.log(`  ${pc.dim("Next steps:")}`);
  console.log(`    cd ${finalProjectName}`);
  console.log(`    npm run dev\n`);
}

const main = defineCommand({
  meta: {
    name: "create-nodalite",
    description: "Scaffold a new Nodalite project",
  },
  args: {
    projectName: {
      type: "positional",
      description: "Project name (optional — will prompt if omitted)",
      required: false,
    },
  },
  run({ args }) {
    run(args.projectName).catch((err) => {
      consola.error(err);
      process.exit(1);
    });
  },
});

runMain(main);

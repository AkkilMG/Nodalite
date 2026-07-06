#!/usr/bin/env node
import { spawn } from "node:child_process";

const subcommand = process.argv[2];

if (subcommand === "create" || subcommand === "init") {
  const child = spawn(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["--yes", "create-nodalite", ...process.argv.slice(3)],
    { stdio: "inherit", shell: true }
  );
  child.on("exit", (code) => process.exit(code ?? 1));
} else {
  console.log(`
  ✦ nodalite — Runtime-agnostic TypeScript API framework

  Usage:
    npx nodalite create        Scaffold a new Nodalite project
    npm create nodalite        Same, via npm's create resolver
    npx create-nodalite        Direct invocation

  Docs: https://nodalite.dev
  `);
}

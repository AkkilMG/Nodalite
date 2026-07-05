"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  Scheduler: () => Scheduler,
  nextRun: () => nextRun,
  parseCron: () => parseCron,
  toServerlessTask: () => toServerlessTask
});
module.exports = __toCommonJS(index_exports);

// src/cron.ts
function parseField(raw, min, max) {
  if (raw === "*") return { matches: () => true };
  const allowed = /* @__PURE__ */ new Set();
  for (const part of raw.split(",")) {
    const stepMatch = part.match(/^(\*|\d+-\d+|\d+)\/(\d+)$/);
    if (stepMatch) {
      const [, range, stepStr] = stepMatch;
      const step = Number(stepStr);
      const [start, end] = range === "*" ? [min, max] : range.includes("-") ? range.split("-").map(Number) : [Number(range), max];
      for (let v = start; v <= end; v += step) allowed.add(v);
      continue;
    }
    const rangeMatch = part.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const [, a, b] = rangeMatch;
      for (let v = Number(a); v <= Number(b); v++) allowed.add(v);
      continue;
    }
    allowed.add(Number(part));
  }
  return { matches: (value) => allowed.has(value) };
}
function parseCron(expression) {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Invalid cron expression "${expression}": expected 5 fields (minute hour dom month dow)`);
  }
  const [minute, hour, dom, month, dow] = parts;
  const fields = {
    minute: parseField(minute, 0, 59),
    hour: parseField(hour, 0, 23),
    dom: parseField(dom, 1, 31),
    month: parseField(month, 1, 12),
    dow: parseField(dow, 0, 6)
  };
  return {
    matches(date) {
      return fields.minute.matches(date.getMinutes()) && fields.hour.matches(date.getHours()) && fields.dom.matches(date.getDate()) && fields.month.matches(date.getMonth() + 1) && fields.dow.matches(date.getDay());
    }
  };
}
function nextRun(matcher, from = /* @__PURE__ */ new Date()) {
  const candidate = new Date(from);
  candidate.setSeconds(0, 0);
  candidate.setMinutes(candidate.getMinutes() + 1);
  const limit = 4 * 365 * 24 * 60;
  for (let i = 0; i < limit; i++) {
    if (matcher.matches(candidate)) return candidate;
    candidate.setMinutes(candidate.getMinutes() + 1);
  }
  throw new Error("Could not find a matching time for this cron expression");
}

// src/scheduler.ts
var Scheduler = class {
  jobs = [];
  stopped = false;
  /** Run `task` every time `cronExpression` matches (standard 5-field cron, minute resolution). */
  cron(cronExpression, task, opts = {}) {
    const matcher = parseCron(cronExpression);
    const name = opts.name ?? cronExpression;
    let timer;
    let stopped = false;
    const scheduleNext = () => {
      if (stopped || this.stopped) return;
      const next = nextRun(matcher);
      const delay = next.getTime() - Date.now();
      timer = setTimeout(async () => {
        try {
          await task();
        } catch (err) {
          opts.onError?.(err, name);
        }
        scheduleNext();
      }, delay);
      timer.unref?.();
    };
    scheduleNext();
    this.jobs.push({
      name,
      stop: () => {
        stopped = true;
        clearTimeout(timer);
      }
    });
    return this;
  }
  /** Run `task` every `intervalMs`, starting after the first interval elapses. */
  every(intervalMs, task, opts = {}) {
    const name = opts.name ?? `every(${intervalMs}ms)`;
    const interval = setInterval(async () => {
      try {
        await task();
      } catch (err) {
        opts.onError?.(err, name);
      }
    }, intervalMs);
    interval.unref?.();
    this.jobs.push({ name, stop: () => clearInterval(interval) });
    return this;
  }
  /** Stop every registered job. */
  stopAll() {
    this.stopped = true;
    for (const job of this.jobs) job.stop();
    this.jobs = [];
  }
  get jobNames() {
    return this.jobs.map((j) => j.name);
  }
};
function toServerlessTask(task) {
  return async (_event, _context) => {
    await task();
    return { ok: true };
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Scheduler,
  nextRun,
  parseCron,
  toServerlessTask
});

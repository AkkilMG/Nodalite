interface CronField {
  matches(value: number): boolean;
}

/** Parses one cron field (e.g. "*", "5", "1-5", "star-slash-15", "1,15,30") into a matcher. */
function parseField(raw: string, min: number, max: number): CronField {
  if (raw === "*") return { matches: () => true };

  const allowed = new Set<number>();
  for (const part of raw.split(",")) {
    const stepMatch = part.match(/^(\*|\d+-\d+|\d+)\/(\d+)$/);
    if (stepMatch) {
      const [, range, stepStr] = stepMatch;
      const step = Number(stepStr);
      const [start, end] = range === "*" ? [min, max] : range!.includes("-") ? range!.split("-").map(Number) : [Number(range), max];
      for (let v = start!; v <= end!; v += step) allowed.add(v);
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
  return { matches: (value: number) => allowed.has(value) };
}

export interface CronMatcher {
  matches(date: Date): boolean;
}

/**
 * Parses a standard 5-field cron expression: `minute hour day-of-month month day-of-week`.
 * Supports `*`, lists (`1,15,30`), ranges (`1-5`), and steps (`*\/15`, `1-10/2`).
 * Does not support seconds-precision or non-standard extensions (`@daily`, etc).
 */
export function parseCron(expression: string): CronMatcher {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Invalid cron expression "${expression}": expected 5 fields (minute hour dom month dow)`);
  }
  const [minute, hour, dom, month, dow] = parts as [string, string, string, string, string];

  const fields = {
    minute: parseField(minute, 0, 59),
    hour: parseField(hour, 0, 23),
    dom: parseField(dom, 1, 31),
    month: parseField(month, 1, 12),
    dow: parseField(dow, 0, 6),
  };

  return {
    matches(date: Date): boolean {
      return (
        fields.minute.matches(date.getMinutes()) &&
        fields.hour.matches(date.getHours()) &&
        fields.dom.matches(date.getDate()) &&
        fields.month.matches(date.getMonth() + 1) &&
        fields.dow.matches(date.getDay())
      );
    },
  };
}

/** Finds the next Date (minute-resolution, at :00 seconds) at or after `from` that matches the cron expression. */
export function nextRun(matcher: CronMatcher, from: Date = new Date()): Date {
  const candidate = new Date(from);
  candidate.setSeconds(0, 0);
  candidate.setMinutes(candidate.getMinutes() + 1);

  // Bounded search: at most ~4 years of minutes, which is always enough to
  // find a match (or throw, which means the expression can never match).
  const limit = 4 * 365 * 24 * 60;
  for (let i = 0; i < limit; i++) {
    if (matcher.matches(candidate)) return candidate;
    candidate.setMinutes(candidate.getMinutes() + 1);
  }
  throw new Error("Could not find a matching time for this cron expression");
}

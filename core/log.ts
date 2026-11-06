// Local date and time in front of log lines, for the container's runtime log, which carries no time of its own.
// Local time on purpose: the container sets TZ=Europe/Zagreb.
import { format } from 'node:util';

const pad = (n: number) => String(n).padStart(2, '0');

// `2026-11-06 19:42:10`, the same form as `date '+%F %T'` in scripts/run-nightly.sh.
export function stamp(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const METHODS = ['log', 'info', 'warn', 'error'] as const;
type Target = Pick<Console, (typeof METHODS)[number]>;

// Marks a method already wrapped, so a second install does not stamp twice.
const STAMPED = Symbol.for('pipeline.log.stamped');

// Wraps console.log/info/warn/error so each call's output starts with the stamp. The arguments are formatted first,
// so format strings like '%s' still work and a multi-line error dump gets the stamp once, at its start.
export function stampConsole(target: Target = console, now: () => Date = () => new Date()): void {
  for (const name of METHODS) {
    const original = target[name] as Target[typeof name] & { [STAMPED]?: true };
    if (original[STAMPED]) continue;
    const wrapped = (...args: unknown[]) => original.call(target, `${stamp(now())} ${format(...args)}`);
    target[name] = Object.assign(wrapped, { [STAMPED]: true as const });
  }
}

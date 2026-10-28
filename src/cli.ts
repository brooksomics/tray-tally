import { weekOfDay } from "./dates.ts";
import type { District } from "./types.ts";

export const USAGE = "usage: node src/run.ts [YYYY-MM-DD [NCES id]]";

type Args = { week?: [string, string]; districts: District[] };

/** An optional date (fetch its Mon-Fri week) and, after it, one district id. */
export function parseArgs(
  args: string[],
  all: District[],
): Args | { error: string } {
  const [day, id, ...extra] = args;
  if (extra.length) return { error: USAGE };
  const week = day === undefined ? undefined : weekOfDay(day);
  if (week === null) return { error: `${USAGE} (not a date: ${day})` };
  const districts = id === undefined ? all : all.filter((d) => d.id === id);
  if (!districts.length) return { error: `unknown district ${id}` };
  return { week, districts };
}

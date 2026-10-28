/** Local YYYY-MM-DD (the job runs on Pacific time, like the menus). */
export const ymd = (d: Date) => d.toLocaleDateString("en-CA");

/** Monday-Friday of now's week, local time; on a weekend, the week just ended. */
/** Week of a YYYY-MM-DD that exists on the calendar; null otherwise (2026-02-31). */
export function weekOfDay(day: string): [string, string] | null {
  const d = new Date(`${day}T12:00:00`);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && ymd(d) === day ? weekOf(d) : null;
}

export function weekOf(now: Date): [string, string] {
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  return [ymd(monday), ymd(friday)];
}

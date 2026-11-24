export const JAKARTA_TZ = "Asia/Jakarta";

const jakartaDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: JAKARTA_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Tanggal hari ini di zona waktu Asia/Jakarta dalam format YYYY-MM-DD. */
export function jakartaToday(now: Date = new Date()): string {
  return jakartaDateFormatter.format(now);
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function isIsoTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Daftar tanggal inklusif dari `from` sampai `to` (maksimal `maxDays` entri). */
export function eachDate(from: string, to: string, maxDays = 92): string[] {
  const dates: string[] = [];
  let cursor = from;
  for (let index = 0; index < maxDays && cursor <= to; index += 1) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

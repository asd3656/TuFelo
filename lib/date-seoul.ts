const SEOUL_TZ = "Asia/Seoul"

/** YYYY-MM-DD in Asia/Seoul for the given instant (default: now). */
export function getSeoulDateString(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SEOUL_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)
}

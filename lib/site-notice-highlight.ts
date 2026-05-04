import { getSeoulDateString } from "@/lib/date-seoul"

/** localStorage: 마지막으로 열어본 공지의 `updated_at` (서버 ISO와 동일 문자열) */
export const SITE_NOTICE_SEEN_KEY = "tufelo_site_notice_seen_updated_at"

/**
 * 서울(Asia/Seoul) 달력 기준, 공지 수정일의 “날짜”부터 몇 일이 지났는지.
 * (자정 기준이라 두 instant가 같은 서울 날이면 0)
 */
export function seoulCalendarDaysSinceNoticeUpdate(updatedIso: string, now: Date = new Date()): number {
  const upd = new Date(updatedIso)
  if (Number.isNaN(upd.getTime())) return 999
  const updDay = getSeoulDateString(upd)
  const nowDay = getSeoulDateString(now)
  const t0 = Date.parse(`${updDay}T12:00:00+09:00`)
  const t1 = Date.parse(`${nowDay}T12:00:00+09:00`)
  return Math.round((t1 - t0) / 86_400_000)
}

/** 서울 자정 기준 달력으로 “이틀” = 수정일 당일 + 다음날 (차이 0, 1) */
export function isNoticeWithinSeoulTwoDayWindow(updatedIso: string | null, now: Date = new Date()): boolean {
  if (!updatedIso) return false
  const d = seoulCalendarDaysSinceNoticeUpdate(updatedIso, now)
  return d >= 0 && d <= 1
}

export function shouldPulseNoticeCapsule(
  updatedAt: string | null,
  seenUpdatedAt: string | null,
  now: Date = new Date(),
): boolean {
  if (!isNoticeWithinSeoulTwoDayWindow(updatedAt, now)) return false
  if (!updatedAt) return false
  if (seenUpdatedAt === updatedAt) return false
  return true
}

export function readSeenSiteNoticeUpdatedAt(): string | null {
  if (typeof window === "undefined") return null
  try {
    return localStorage.getItem(SITE_NOTICE_SEEN_KEY)
  } catch {
    return null
  }
}

export function writeSeenSiteNoticeUpdatedAt(iso: string): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(SITE_NOTICE_SEEN_KEY, iso)
  } catch {
    /* ignore */
  }
}

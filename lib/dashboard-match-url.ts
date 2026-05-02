import type { MatchFilterState } from "@/lib/match-filter-state"
import { resolveMemberIdsByPlayerQuery } from "@/lib/resolve-member-ids-by-player-query"

type MemberIdName = { id: string; name: string }

/** URL 공유 시 한 명으로 확정되면 DB 표기 이름으로 통일 */
export function canonicalizePlayerQueryFromUrl(members: MemberIdName[], raw: string): string {
  const ids = resolveMemberIdsByPlayerQuery(members, raw)
  if (ids.length !== 1) return raw
  return members.find((m) => m.id === ids[0])?.name ?? raw
}

function parsePositivePage(sp: URLSearchParams): number {
  const p = parseInt(sp.get("page") ?? "1", 10)
  if (!Number.isFinite(p) || p < 1) return 1
  return p
}

function flatMultiParam(sp: URLSearchParams, key: string): string[] {
  const out: string[] = []
  for (const r of sp.getAll(key)) {
    for (const part of r.split(",")) {
      const t = part.trim()
      if (t) out.push(t)
    }
  }
  return [...new Set(out)]
}

function isValidTier(v: string): v is "1" | "2" | "3" | "4" {
  return v === "1" || v === "2" || v === "3" || v === "4"
}

export function isDefaultMatchFilters(f: MatchFilterState): boolean {
  return (
    f.player1.trim() === "" &&
    f.player2.trim() === "" &&
    f.dateFrom === "" &&
    f.dateTo === "" &&
    f.map.trim() === "" &&
    f.matchTypes.length === 0 &&
    f.seasonIds.length === 0 &&
    f.player1Tiers.length === 0
  )
}

export function parseDashboardMatchUrl(
  sp: URLSearchParams,
  members: MemberIdName[],
): { filters: MatchFilterState; page: number } {
  const playerRaw = (sp.get("player") ?? sp.get("player1") ?? "").trim()
  const player2Raw = (sp.get("player2") ?? "").trim()

  const player1 = members.length ? canonicalizePlayerQueryFromUrl(members, playerRaw) : playerRaw
  const player2 = members.length ? canonicalizePlayerQueryFromUrl(members, player2Raw) : player2Raw

  const player1Tiers = flatMultiParam(sp, "player1Tier").filter(isValidTier)

  return {
    filters: {
      player1,
      player2,
      dateFrom: sp.get("dateFrom") ?? "",
      dateTo: sp.get("dateTo") ?? "",
      map: sp.get("map")?.trim() ?? "",
      matchTypes: flatMultiParam(sp, "matchType"),
      seasonIds: flatMultiParam(sp, "seasonId"),
      player1Tiers,
    },
    page: parsePositivePage(sp),
  }
}

/** 선수(기준)는 데이터센터·랭킹 링크와 맞추기 위해 `player` 키로 기록 */
export function buildDashboardMatchSearchParams(
  f: MatchFilterState,
  page: number,
): URLSearchParams {
  const p = new URLSearchParams()
  if (page > 1) p.set("page", String(page))
  if (f.player1.trim()) p.set("player", f.player1.trim())
  if (f.player2.trim()) p.set("player2", f.player2.trim())
  if (f.dateFrom) p.set("dateFrom", f.dateFrom)
  if (f.dateTo) p.set("dateTo", f.dateTo)
  if (f.map.trim()) p.set("map", f.map.trim())
  for (const t of f.matchTypes) {
    if (t.trim()) p.append("matchType", t.trim())
  }
  for (const id of f.seasonIds) {
    if (id.trim()) p.append("seasonId", id.trim())
  }
  for (const tier of f.player1Tiers) {
    if (tier) p.append("player1Tier", tier)
  }
  return p
}

/** 쿼리 비교(키 순서·중복 인코딩 차이 흡수) */
export function dashboardUrlQueryEquals(a: URLSearchParams, b: URLSearchParams): boolean {
  const entries = (sp: URLSearchParams) =>
    [...sp.entries()]
      .map(([k, v]) => [k, v] as const)
      .sort(([k1, v1], [k2, v2]) => (k1 === k2 ? v1.localeCompare(v2) : k1.localeCompare(k2)))
  const sa = entries(a)
      .map(([k, v]) => `${k}=${v}`)
      .join("&")
  const sb = entries(b)
      .map(([k, v]) => `${k}=${v}`)
      .join("&")
  return sa === sb
}

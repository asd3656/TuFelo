import type { MemberForRanking, MatchForRanking, Race, Tier, Season, SeasonRankingEntry } from "@/lib/types/tufelo"

/** 랭킹 페이지에서 계산된 선수 데이터 */
export interface ComputedPlayer {
  id: string
  rank: number
  name: string
  race: Race
  tier: Tier
  elo: number
  wins: number
  losses: number
  streak: number
  /** 마지막 경기의 ELO 변동 (현재 시즌 한정) */
  change: number
  /** 오늘 기준 순위 변동 (현재 시즌 한정) */
  rankChange: number
}

/** YYYY-MM-DD 형태의 오늘 날짜 (UTC 기준) */
export function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * 필터 조건에 맞는 선수 목록을 ELO 순으로 정렬하여 반환합니다.
 * @param hideUnplayed true이면 전적이 없는 선수(0승 0패)를 제외합니다 (공개 랭킹용).
 */
export function computeRankedPlayers(
  members: MemberForRanking[],
  allMatches: MatchForRanking[],
  filterSeasonId: string,
  filterRace: string,
  filterTier: string,
  pastSeasonRankings: Record<string, SeasonRankingEntry[]>,
  hideUnplayed = false,
): ComputedPlayer[] {
  const eligibleMembers = members.filter(
    (m) =>
      (filterRace === "__all__" || m.race === filterRace) &&
      (filterTier === "__all__" || m.tier === Number(filterTier)),
  )

  // ── 과거 시즌: 스냅샷 데이터 사용 ──
  if (filterSeasonId !== "__current__") {
    const entries = pastSeasonRankings[filterSeasonId] ?? []
    return entries
      .filter(
        (e) =>
          (filterRace === "__all__" || e.memberRace === filterRace) &&
          (filterTier === "__all__" || e.memberTier === Number(filterTier)) &&
          (!hideUnplayed || e.finalWins + e.finalLosses > 0),
      )
      .map((e, i) => ({
        id: e.memberId,
        rank: i + 1,
        name: e.memberName,
        race: e.memberRace,
        tier: e.memberTier,
        elo: e.finalElo,
        wins: e.finalWins,
        losses: e.finalLosses,
        streak: 0,
        change: 0,
        rankChange: 0,
      }))
  }

  // ── 현재 시즌: members.elo 기준, 마지막 ELO 변동 계산 ──
  const lastChangeMap = new Map<string, number>()
  for (const m of allMatches) {
    if (!lastChangeMap.has(m.player1Id) && m.player1EloDelta !== null)
      lastChangeMap.set(m.player1Id, m.player1EloDelta)
    if (!lastChangeMap.has(m.player2Id) && m.player2EloDelta !== null)
      lastChangeMap.set(m.player2Id, m.player2EloDelta)
  }

  // 오늘 경기의 ELO 변동 합계 (순위 변동 계산용)
  const today = getTodayDate()
  const recentDeltaMap = new Map<string, number>()
  for (const m of allMatches) {
    if (m.playedDate < today) continue
    if (m.player1EloDelta !== null)
      recentDeltaMap.set(m.player1Id, (recentDeltaMap.get(m.player1Id) ?? 0) + m.player1EloDelta)
    if (m.player2EloDelta !== null)
      recentDeltaMap.set(m.player2Id, (recentDeltaMap.get(m.player2Id) ?? 0) + m.player2EloDelta)
  }

  const sorted = eligibleMembers
    .filter((m) => !hideUnplayed || m.wins + m.losses > 0)
    .map((m) => ({
      id: m.id,
      name: m.name,
      race: m.race,
      tier: m.tier,
      elo: m.elo,
      wins: m.wins,
      losses: m.losses,
      streak: m.streak,
      change: lastChangeMap.get(m.id) ?? 0,
      rankChange: 0,
      rank: 0,
    }))
    .sort((a, b) => b.elo - a.elo)

  // 오늘 경기 이전 순위 계산 → 순위 변동 도출
  const oldRankSorted = [...sorted]
    .map((p) => ({ id: p.id, elo: p.elo - (recentDeltaMap.get(p.id) ?? 0) }))
    .sort((a, b) => b.elo - a.elo)
  const oldRankMap = new Map(oldRankSorted.map((p, i) => [p.id, i + 1]))

  return sorted.map((p, i) => ({
    ...p,
    rank: i + 1,
    rankChange: (oldRankMap.get(p.id) ?? i + 1) - (i + 1),
  }))
}

/** 시즌 기간을 "YYYY.MM ~ YYYY.MM" 형식으로 포맷합니다 */
export function formatSeasonDateRange(season: Season): string {
  const start = season.startDate.replace(/-/g, ".").slice(0, 7)
  if (!season.endDate) return `${start} ~ `
  const end = season.endDate.replace(/-/g, ".").slice(0, 7)
  return `${start} ~ ${end}`
}

/** 종족별 Badge 클래스 */
export const raceColors: Record<string, string> = {
  T: "bg-blue-100 dark:bg-blue-600/20 text-blue-700 dark:text-blue-400 border-blue-400/60 dark:border-blue-500/30",
  P: "bg-amber-100 dark:bg-amber-600/20 text-amber-700 dark:text-amber-400 border-amber-400/60 dark:border-amber-500/30",
  Z: "bg-red-100 dark:bg-red-600/20 text-red-700 dark:text-red-400 border-red-400/60 dark:border-red-500/30",
}

/** 종족 영문명 */
export const raceNames: Record<string, string> = { T: "Terran", P: "Protoss", Z: "Zerg" }

/** 티어별 Badge 클래스 */
export const tierColors: Record<number, string> = {
  1: "bg-yellow-100 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-400/60 dark:border-yellow-500/30",
  2: "bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400 border-purple-400/60 dark:border-purple-500/30",
  3: "bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-400/60 dark:border-blue-500/30",
  4: "bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400 border-green-400/60 dark:border-green-500/30",
}

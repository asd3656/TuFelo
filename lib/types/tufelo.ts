import type { EloTier } from "@/lib/elo"

export type Tier = EloTier

export type Race = "T" | "P" | "Z"

/** 서버 액션 공통 반환 타입 */
export type ActionResult = { ok: true } | { ok: false; error: string }

export const MATCH_TYPES = [
  "친선",
  "팀매배",
  "프로리그 시즌1",
  "프로리그 시즌2",
  "프로리그 시즌3",
  "프로리그 시즌4",
] as const

export type MatchType = (typeof MATCH_TYPES)[number]

export interface Match {
  id: string
  player1Id: string
  player2Id: string
  player1: string
  player2: string
  player1Race?: Race
  player2Race?: Race
  player1Tier?: Tier
  player2Tier?: Tier
  player1EloDelta?: number
  player2EloDelta?: number
  winner: string
  map: string
  date: string
  matchType?: string
}

/** 클랜원 목록/관리 UI */
export interface ClanMember {
  id: string
  name: string
  race: Race
  tier: Tier
  elo: number
  wins: number
  losses: number
  streak: number
  isActive: boolean
}

export interface RegisterMatchInput {
  player1Id: string
  player2Id: string
  mapName: string
  playedDate: string
  matchType: string
}

/** 전적 수정 입력 — 선수는 고정, 승자/맵/날짜/유형만 수정 */
export interface UpdateMatchInput {
  matchId: string
  /** true = player1 승리, false = player2 승리 */
  isPlayer1Winner: boolean
  mapName: string
  playedDate: string
  matchType: string
}

/** 랭킹 페이지용 원시 멤버 데이터 */
export interface MemberForRanking {
  id: string
  name: string
  race: Race
  tier: Tier
  elo: number
  wins: number
  losses: number
  streak: number
}

/** 랭킹 계산용 경량 경기 데이터 */
export interface MatchForRanking {
  id: string
  player1Id: string
  player2Id: string
  winnerId: string
  matchType: string
  player1EloDelta: number | null
  player2EloDelta: number | null
  playedDate: string
  createdAt: string
  seasonId: string | null
}

export interface Season {
  id: string
  name: string
  startDate: string
  endDate: string | null
  createdAt: string
}

export interface SeasonRankingEntry {
  id: string
  seasonId: string
  memberId: string
  memberName: string
  memberRace: Race
  memberTier: Tier
  finalElo: number
  finalWins: number
  finalLosses: number
  rank: number
}

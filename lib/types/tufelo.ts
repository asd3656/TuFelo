import type { EloTier } from "@/lib/elo"

export type Tier = EloTier

export type Race = "T" | "P" | "Z"

export interface Match {
  id: string
  player1: string
  player2: string
  player1Race?: Race
  player2Race?: Race
  player1Tier?: Tier
  player2Tier?: Tier
  player1EloDelta?: number
  winner: string
  map: string
  date: string
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
}

export interface RegisterMatchInput {
  player1Id: string
  player2Id: string
  mapName: string
  playedDate: string
}

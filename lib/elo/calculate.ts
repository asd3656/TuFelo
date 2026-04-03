import { getEloConfig, defaultEloConfig, type EloConfig } from "./config"
import type { EloTier } from "./types"

export interface EloMatchResult {
  newWinnerElo: number
  newLoserElo: number
  winnerDelta: number
  loserDelta: number
  /** 승자 관점 기대 승률 (0~1) */
  expectedWinForWinner: number
}

/**
 * 두 선수 레이팅으로 승자의 기대 승률을 계산합니다.
 * E = 1 / (1 + 10^((loser - winner) / scale))
 */
export function expectedWinForWinnerRating(
  winnerRating: number,
  loserRating: number,
  scale: number = defaultEloConfig.scale,
): number {
  return 1 / (1 + Math.pow(10, (loserRating - winnerRating) / scale))
}

/**
 * 단판 승부 후 새 레이팅 (표준 ELO, 승자 1점·패자 0점).
 * DB 업데이트 예: UPDATE players SET elo = :newWinnerElo WHERE id = winnerId
 */
export function computeEloMatch(
  winnerElo: number,
  loserElo: number,
  configOverrides?: Partial<EloConfig>,
): EloMatchResult {
  const { kFactor, scale } = getEloConfig(configOverrides)
  const expectedWin = expectedWinForWinnerRating(winnerElo, loserElo, scale)
  const rawWinner = winnerElo + kFactor * (1 - expectedWin)
  const rawLoser = loserElo + kFactor * (0 - (1 - expectedWin))
  const newWinnerElo = Math.round(rawWinner)
  const newLoserElo = Math.round(rawLoser)
  return {
    newWinnerElo,
    newLoserElo,
    winnerDelta: newWinnerElo - winnerElo,
    loserDelta: newLoserElo - loserElo,
    expectedWinForWinner: expectedWin,
  }
}

/** 경기 직전 레이팅을 알 때, 선수1 관점의 ELO 변동 (승 + / 패 -). */
export function getPlayer1EloDeltaFromPrematchRatings(
  params: {
    winnerIsPlayer1: boolean
    player1Elo: number
    player2Elo: number
  },
  configOverrides?: Partial<EloConfig>,
): number {
  if (params.winnerIsPlayer1) {
    return computeEloMatch(params.player1Elo, params.player2Elo, configOverrides).winnerDelta
  }
  return computeEloMatch(params.player2Elo, params.player1Elo, configOverrides).loserDelta
}

/**
 * 데모/초기값용: 양 선수 티어 기본 레이팅을 직전 점수로 가정하고 선수1의 변동만 계산.
 * 실제 서비스에서는 Supabase에서 읽은 직전 elo로 computeEloMatch 호출 권장.
 */
export function getPlayer1EloDeltaFromTiers(
  params: {
    winnerName: string
    player1Name: string
    player2Name: string
    player1Tier?: EloTier
    player2Tier?: EloTier
  },
  configOverrides?: Partial<EloConfig>,
): number | undefined {
  const { player1Tier, player2Tier, winnerName, player1Name, player2Name } = params
  if (player1Tier === undefined || player2Tier === undefined) return undefined
  const cfg = getEloConfig(configOverrides)
  const r1 = cfg.tierStartingElo[player1Tier]
  const r2 = cfg.tierStartingElo[player2Tier]
  const winnerIsPlayer1 =
    winnerName.trim().toLowerCase() === player1Name.trim().toLowerCase()
  if (winnerIsPlayer1) {
    return computeEloMatch(r1, r2, cfg).winnerDelta
  }
  if (winnerName.trim().toLowerCase() !== player2Name.trim().toLowerCase()) {
    return undefined
  }
  return computeEloMatch(r2, r1, cfg).loserDelta
}

import type { EloTier } from "./types"

export interface EloConfig {
  /** 승점 반영 강도 (일반적으로 16~40, 기본 32) */
  kFactor: number
  /** 기대 승률 식의 분모 (표준 Elo는 400) */
  scale: number
  /** 티어별 0승 0패 기준 시작 레이팅 */
  tierStartingElo: Record<EloTier, number>
}

export const defaultEloConfig: EloConfig = {
  kFactor: 32,
  scale: 400,
  tierStartingElo: {
    1: 2250,
    2: 2030,
    3: 1850,
    4: 1650,
  },
}

function readNumberEnv(value: string | undefined): number | undefined {
  if (value === undefined || value === "") return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

/**
 * Supabase 업데이트·클라이언트 공통으로 같은 설정을 쓰도록 한 진입점.
 * 나중에 관리자 UI에서 넘긴 값으로 overrides 하거나,
 * NEXT_PUBLIC_ELO_K_FACTOR 등으로 조정 가능.
 */
export function getEloConfig(overrides?: Partial<EloConfig>): EloConfig {
  const merged: EloConfig = {
    ...defaultEloConfig,
    ...overrides,
    tierStartingElo: {
      ...defaultEloConfig.tierStartingElo,
      ...(overrides?.tierStartingElo ?? {}),
    },
  }
  if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_ELO_K_FACTOR) {
    const k = readNumberEnv(process.env.NEXT_PUBLIC_ELO_K_FACTOR)
    if (k !== undefined) merged.kFactor = k
  }
  if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_ELO_SCALE) {
    const s = readNumberEnv(process.env.NEXT_PUBLIC_ELO_SCALE)
    if (s !== undefined) merged.scale = s
  }
  return merged
}

export function getStartingEloForTier(tier: EloTier, config?: Partial<EloConfig>): number {
  return getEloConfig(config).tierStartingElo[tier]
}

/** 대시보드 전적 목록 필터 — `/api/matches` 및 홈 URL 쿼리와 동일 의미 */
export interface MatchFilterState {
  player1: string
  player2: string
  dateFrom: string
  dateTo: string
  map: string
  matchTypes: string[]
  seasonIds: string[]
  /** DB 행 기준 선수1(player1_id)의 현재 티어 목록 — 비어있으면 미적용 */
  player1Tiers: string[]
}

export const DEFAULT_MATCH_FILTERS: MatchFilterState = {
  player1: "",
  player2: "",
  dateFrom: "",
  dateTo: "",
  map: "",
  matchTypes: [],
  seasonIds: [],
  player1Tiers: [],
}

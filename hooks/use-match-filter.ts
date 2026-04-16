"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { Match } from "@/lib/types/tufelo"

export interface MatchFilterState {
  player1: string
  player2: string
  dateFrom: string
  dateTo: string
  map: string
  matchTypes: string[]
  seasonId: string
  /** DB 행 기준 선수1(player1_id)의 현재 티어 — `__all__`이면 미적용 */
  player1Tier: string
}

const DEFAULT_FILTERS: MatchFilterState = {
  player1: "",
  player2: "",
  dateFrom: "",
  dateTo: "",
  map: "",
  matchTypes: [],
  seasonId: "__all__",
  player1Tier: "__all__",
}

interface UseMatchFilterOptions {
  initialMatches: Match[]
  initialTotalCount: number
  initialTotalPages: number
}

/**
 * 대시보드 전적 목록의 필터 상태와 /api/matches fetch 로직을 캡슐화한 훅.
 * - debounce: 텍스트 입력 (선수명, 맵) 350ms 지연
 * - immediate: 날짜/드롭다운 변경 시 즉시 fetch
 * - AbortController로 중복 요청 취소
 */
export function useMatchFilter({
  initialMatches,
  initialTotalCount,
  initialTotalPages,
}: UseMatchFilterOptions) {
  const [filters, setFilters] = useState<MatchFilterState>(DEFAULT_FILTERS)
  const [currentPage, setCurrentPage] = useState(1)
  const [matches, setMatches] = useState<Match[]>(initialMatches)
  const [totalCount, setTotalCount] = useState(initialTotalCount)
  const [totalPages, setTotalPages] = useState(initialTotalPages)
  const [wins, setWins] = useState(0)
  const [losses, setLosses] = useState(0)
  const [isLoading, setIsLoading] = useState(false)

  // debounce 타이머와 abort controller를 ref로 관리
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  // 최신 필터값을 ref에 동기화 (debounce 콜백에서 항상 최신값 참조)
  const filtersRef = useRef(filters)
  filtersRef.current = filters

  // 첫 렌더 여부 추적 (SSR 초기 데이터 활용)
  const isMountedRef = useRef(false)

  const doFetch = useCallback(async (page: number, f: MatchFilterState) => {
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    setIsLoading(true)

    const params = new URLSearchParams({
      page: String(page),
      player1: f.player1,
      player2: f.player2,
      dateFrom: f.dateFrom,
      dateTo: f.dateTo,
      map: f.map,
      seasonId: f.seasonId === "__all__" ? "" : f.seasonId,
      player1Tier: f.player1Tier === "__all__" ? "" : f.player1Tier,
    })
    f.matchTypes.forEach((type) => params.append("matchType", type))

    try {
      const res = await fetch(`/api/matches?${params}`, {
        signal: abortRef.current.signal,
      })
      if (!res.ok) throw new Error("fetch failed")
      const data = await res.json()
      setMatches(data.matches ?? [])
      setTotalCount(data.totalCount ?? 0)
      setTotalPages(data.totalPages ?? 0)
      setWins(data.wins ?? 0)
      setLosses(data.losses ?? 0)
      setCurrentPage(page)
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        console.error("경기 데이터 로드 실패:", e)
      }
    } finally {
      setIsLoading(false)
    }
  }, [])

  // router.refresh() 후 SSR props가 바뀌면 현재 필터 상태로 재조회
  useEffect(() => {
    if (!isMountedRef.current) {
      isMountedRef.current = true
      return
    }
    doFetch(1, filtersRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMatches])

  /** 텍스트 입력용 debounce fetch */
  const triggerDebouncedFetch = useCallback((override: Partial<MatchFilterState>) => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    debounceTimerRef.current = setTimeout(() => {
      doFetch(1, { ...filtersRef.current, ...override })
    }, 350)
  }, [doFetch])

  /** 드롭다운·날짜 변경 시 즉시 fetch */
  const triggerImmediateFetch = useCallback((override: Partial<MatchFilterState>) => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    doFetch(1, { ...filtersRef.current, ...override })
  }, [doFetch])

  function handlePageChange(page: number, totalPgs: number) {
    if (page < 1 || page > totalPgs || page === currentPage) return
    doFetch(page, filtersRef.current)
  }

  function setPlayer1(val: string) {
    setFilters((f) => ({ ...f, player1: val }))
    triggerDebouncedFetch({ player1: val })
  }

  function setPlayer2(val: string) {
    setFilters((f) => ({ ...f, player2: val }))
    triggerDebouncedFetch({ player2: val })
  }

  function setMap(val: string) {
    setFilters((f) => ({ ...f, map: val }))
    triggerDebouncedFetch({ map: val })
  }

  function setDateFrom(val: string) {
    setFilters((f) => ({ ...f, dateFrom: val }))
    triggerImmediateFetch({ dateFrom: val })
  }

  function setDateTo(val: string) {
    setFilters((f) => ({ ...f, dateTo: val }))
    triggerImmediateFetch({ dateTo: val })
  }

  function setMatchTypes(vals: string[]) {
    setFilters((f) => ({ ...f, matchTypes: vals }))
    triggerImmediateFetch({ matchTypes: vals })
  }

  function setSeasonId(val: string) {
    setFilters((f) => ({ ...f, seasonId: val }))
    triggerImmediateFetch({ seasonId: val })
  }

  function setPlayer1Tier(val: string) {
    setFilters((f) => ({ ...f, player1Tier: val }))
    triggerImmediateFetch({ player1Tier: val })
  }

  return {
    filters,
    currentPage,
    matches,
    totalCount,
    totalPages,
    wins,
    losses,
    isLoading,
    handlePageChange,
    setPlayer1,
    setPlayer2,
    setMap,
    setDateFrom,
    setDateTo,
    setMatchTypes,
    setSeasonId,
    setPlayer1Tier,
  }
}

"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import type { Match } from "@/lib/types/tufelo"
import {
  DEFAULT_MATCH_FILTERS,
  type MatchFilterState,
} from "@/lib/match-filter-state"
import {
  buildDashboardMatchSearchParams,
  dashboardUrlQueryEquals,
  isDefaultMatchFilters,
  parseDashboardMatchUrl,
} from "@/lib/dashboard-match-url"

export type { MatchFilterState } from "@/lib/match-filter-state"

interface UseMatchFilterOptions {
  initialMatches: Match[]
  initialTotalCount: number
  initialTotalPages: number
  members: Pick<{ id: string; name: string }, "id" | "name">[]
}

/**
 * 대시보드 전적 목록의 필터 상태와 /api/matches fetch 로직을 캡슐화한 훅.
 * - URL과 동기화(공유 링크) — 쿼리 키는 `lib/dashboard-match-url` 참고
 * - debounce: 텍스트 입력 (선수명, 맵) 350ms 지연
 * - immediate: 날짜/드롭다운 변경 시 즉시 fetch
 * - AbortController로 중복 요청 취소
 */
export function useMatchFilter({
  initialMatches,
  initialTotalCount,
  initialTotalPages,
  members,
}: UseMatchFilterOptions) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [filters, setFilters] = useState<MatchFilterState>(() =>
    parseDashboardMatchUrl(
      new URLSearchParams(searchParams.toString()),
      members,
    ).filters,
  )
  const [currentPage, setCurrentPage] = useState(() =>
    parseDashboardMatchUrl(
      new URLSearchParams(searchParams.toString()),
      members,
    ).page,
  )

  const [matches, setMatches] = useState<Match[]>(initialMatches)
  const [totalCount, setTotalCount] = useState(initialTotalCount)
  const [totalPages, setTotalPages] = useState(initialTotalPages)
  const [wins, setWins] = useState(0)
  const [losses, setLosses] = useState(0)
  const [isLoading, setIsLoading] = useState(false)

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const filtersRef = useRef(filters)
  filtersRef.current = filters
  const currentPageRef = useRef(currentPage)
  currentPageRef.current = currentPage

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
    })
    f.matchTypes.forEach((type) => params.append("matchType", type))
    f.seasonIds.forEach((seasonId) => params.append("seasonId", seasonId))
    f.player1Tiers.forEach((tier) => params.append("player1Tier", tier))

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

  // router.refresh() 후 SSR props가 바뀌면 현재 페이지·필터 상태 그대로 재조회
  useEffect(() => {
    if (!isMountedRef.current) {
      isMountedRef.current = true
      return
    }
    doFetch(currentPageRef.current, filtersRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMatches])

  /** URL에 필터·페이지가 있으면 SSR 초기 목록과 불일치 → 클라이언트에서 즉시 맞춤 */
  useEffect(() => {
    const urlHadFilters =
      !isDefaultMatchFilters(filters) || currentPage > 1
    if (urlHadFilters) {
      doFetch(currentPage, filters)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 마운트 시 URL 스냅샷만
  }, [])

  /** 필터·페이지 ↔ 주소창 쿼리 동기화 (데이터센터와 유사, 공유 링크용) */
  useEffect(() => {
    const built = buildDashboardMatchSearchParams(filters, currentPage)
    if (dashboardUrlQueryEquals(built, searchParams)) return
    const q = built.toString()
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false })
  }, [filters, currentPage, pathname, router, searchParams])

  const triggerDebouncedFetch = useCallback(
    (override: Partial<MatchFilterState>) => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = setTimeout(() => {
        doFetch(1, { ...filtersRef.current, ...override })
      }, 350)
    },
    [doFetch],
  )

  const triggerImmediateFetch = useCallback(
    (override: Partial<MatchFilterState>) => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
      doFetch(1, { ...filtersRef.current, ...override })
    },
    [doFetch],
  )

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

  function setSeasonIds(vals: string[]) {
    setFilters((f) => ({ ...f, seasonIds: vals }))
    triggerImmediateFetch({ seasonIds: vals })
  }

  function setPlayer1Tiers(vals: string[]) {
    setFilters((f) => ({ ...f, player1Tiers: vals }))
    triggerImmediateFetch({ player1Tiers: vals })
  }

  const resetFilters = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }
    setFilters(DEFAULT_MATCH_FILTERS)
    doFetch(1, DEFAULT_MATCH_FILTERS)
  }, [doFetch])

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
    setSeasonIds,
    setPlayer1Tiers,
    resetFilters,
  }
}

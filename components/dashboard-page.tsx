"use client"

import { useCallback, useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { PlayerSearch } from "@/components/player-search"
import { MatchHistory } from "@/components/match-history"
import { RegisterMatchDialog } from "@/components/register-match-dialog"
import { EditMatchDialog } from "@/components/edit-match-dialog"
import { AdminLoginDialog } from "@/components/admin-login-dialog"
import { NoticeSuggestionDialog } from "@/components/notice-suggestion-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import { Plus, Trophy, BarChart3, Users, Megaphone, Loader2 } from "lucide-react"
import { getSeoulDateString } from "@/lib/date-seoul"
import type { ClanMember, Match, RegisterMatchInput, UpdateMatchInput } from "@/lib/types/tufelo"
import { registerMatchAction, deleteMatchAction, updateMatchAction } from "@/app/actions/matches"

export type { Tier, Race, Match } from "@/lib/types/tufelo"

const PAGE_SIZE = 50

interface FilterState {
  player1: string
  player2: string
  dateFrom: string
  dateTo: string
  map: string
  matchType: string
}

interface DashboardPageProps {
  initialMatches: Match[]
  initialTotalCount: number
  initialTotalPages: number
  knownMaps: string[]
  knownMatchTypes: string[]
  members: ClanMember[]
  isAdmin: boolean
  isCreator?: boolean
  adminUsernames?: string[]
}

function getPageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  if (current <= 4) return [1, 2, 3, 4, 5, "...", total]
  if (current >= total - 3) return [1, "...", total - 4, total - 3, total - 2, total - 1, total]
  return [1, "...", current - 1, current, current + 1, "...", total]
}

export function DashboardPage({
  initialMatches,
  initialTotalCount,
  initialTotalPages,
  knownMaps,
  knownMatchTypes,
  members,
  isAdmin,
  isCreator,
  adminUsernames = [],
}: DashboardPageProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isDeletePending, startDeleteTransition] = useTransition()
  const [isEditPending, startEditTransition] = useTransition()
  const [editingMatch, setEditingMatch] = useState<Match | null>(null)
  const [isNoticeOpen, setIsNoticeOpen] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [adminLoginOpen, setAdminLoginOpen] = useState(false)

  // 필터 상태
  const [player1, setPlayer1] = useState("")
  const [player2, setPlayer2] = useState("")
  const [filterDateFrom, setFilterDateFrom] = useState("")
  const [filterDateTo, setFilterDateTo] = useState("")
  const [filterMap, setFilterMap] = useState("")
  const [filterMatchType, setFilterMatchType] = useState("__all__")

  // 페이지네이션 & 경기 데이터 상태
  const [currentPage, setCurrentPage] = useState(1)
  const [matches, setMatches] = useState<Match[]>(initialMatches)
  const [totalCount, setTotalCount] = useState(initialTotalCount)
  const [totalPages, setTotalPages] = useState(initialTotalPages)
  const [wins, setWins] = useState(0)
  const [losses, setLosses] = useState(0)
  const [isLoadingMatches, setIsLoadingMatches] = useState(false)

  const seoulToday = getSeoulDateString()
  const memberOptions = members.map((m) => ({ id: m.id, name: m.name }))

  // 필터 최신값을 ref로 관리 (debounce 타이머에서 항상 최신값 참조)
  const filtersRef = useRef<FilterState>({
    player1: "",
    player2: "",
    dateFrom: "",
    dateTo: "",
    map: "",
    matchType: "__all__",
  })
  filtersRef.current = {
    player1,
    player2,
    dateFrom: filterDateFrom,
    dateTo: filterDateTo,
    map: filterMap,
    matchType: filterMatchType,
  }

  // Abort controller (중복 요청 취소)
  const abortRef = useRef<AbortController | null>(null)
  // Debounce 타이머
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 초기 마운트 여부 (첫 렌더는 SSR 데이터 사용)
  const isMountedRef = useRef(false)

  const doFetch = useCallback(async (page: number, filters: FilterState) => {
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    setIsLoadingMatches(true)

    const params = new URLSearchParams({
      page: String(page),
      player1: filters.player1,
      player2: filters.player2,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      map: filters.map,
      matchType: filters.matchType === "__all__" ? "" : filters.matchType,
    })

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
      setIsLoadingMatches(false)
    }
  }, [])

  // 즉시 fetch (날짜/드롭다운 필터)
  function triggerImmediateFetch(overrides?: Partial<FilterState>) {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    doFetch(1, { ...filtersRef.current, ...overrides })
  }

  // router.refresh() 후 SSR 데이터가 갱신되면 현재 필터로 재요청
  useEffect(() => {
    if (!isMountedRef.current) {
      isMountedRef.current = true
      return
    }
    doFetch(1, filtersRef.current)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMatches])

  // 페이지 이동
  function handlePageChange(page: number) {
    if (page < 1 || page > totalPages || page === currentPage) return
    doFetch(page, filtersRef.current)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  // 필터 핸들러
  function handlePlayer1Change(val: string) {
    setPlayer1(val)
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    debounceTimerRef.current = setTimeout(() => {
      doFetch(1, { ...filtersRef.current, player1: val })
    }, 350)
  }

  function handlePlayer2Change(val: string) {
    setPlayer2(val)
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    debounceTimerRef.current = setTimeout(() => {
      doFetch(1, { ...filtersRef.current, player2: val })
    }, 350)
  }

  function handleMapChange(val: string) {
    setFilterMap(val)
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    debounceTimerRef.current = setTimeout(() => {
      doFetch(1, { ...filtersRef.current, map: val })
    }, 350)
  }

  function handleDateFromChange(val: string) {
    const clamped = !val ? "" : val > seoulToday ? seoulToday : val
    setFilterDateFrom(clamped)
    triggerImmediateFetch({ dateFrom: clamped })
  }

  function handleDateToChange(val: string) {
    const clamped = !val ? "" : val > seoulToday ? seoulToday : val
    setFilterDateTo(clamped)
    triggerImmediateFetch({ dateTo: clamped })
  }

  function handleMatchTypeChange(val: string) {
    setFilterMatchType(val)
    triggerImmediateFetch({ matchType: val })
  }

  // 전적 등록/수정/삭제
  function handleRegister(input: RegisterMatchInput, keepOpen?: boolean) {
    if (!isAdmin) {
      window.alert("운영진만 전적을 등록할 수 있습니다.")
      return
    }
    startTransition(async () => {
      const res = await registerMatchAction(input)
      if (!res.ok) {
        window.alert(res.error)
        return
      }
      if (!keepOpen) setIsDialogOpen(false)
      router.refresh()
    })
  }

  function handleEditMatch(input: UpdateMatchInput) {
    if (!isAdmin) {
      window.alert("운영진만 전적을 수정할 수 있습니다.")
      return
    }
    startEditTransition(async () => {
      const res = await updateMatchAction(input)
      if (!res.ok) {
        window.alert(res.error)
        return
      }
      setEditingMatch(null)
      router.refresh()
    })
  }

  function handleDeleteMatch(matchId: string) {
    if (!isAdmin) {
      window.alert("운영진에게 문의하세요.")
      return
    }
    startDeleteTransition(async () => {
      const res = await deleteMatchAction(matchId)
      if (!res.ok) {
        window.alert(res.error)
        return
      }
      router.refresh()
    })
  }

  const pageNumbers = getPageNumbers(currentPage, totalPages)

  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <header className="mb-10">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Trophy className="h-8 w-8 text-primary" />
                <h1 className="text-4xl font-bold text-foreground">TuF Clan ELO board</h1>
              </div>
              {adminUsernames.length > 0 && (
                <p className="text-base text-indigo-400 bg-indigo-500/10 border border-indigo-500/25 rounded-md px-2.5 py-1 w-fit font-medium">
                  관리자 : {adminUsernames.join(", ")}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2 justify-end">
              {isCreator && (
                <Link href="/creator">
                  <Button className="bg-red-600 hover:bg-red-700 text-white font-semibold shadow-md border-0">
                    제작자 페이지
                  </Button>
                </Link>
              )}
              <Button
                type="button"
                className="bg-amber-600 hover:bg-amber-700 text-white font-semibold shadow-md border-0"
                onClick={() => setAdminLoginOpen(true)}
              >
                관리자 로그인
              </Button>
              {isAdmin && (
                <Link href="/ranking">
                  <Button variant="outline" className="border-border text-foreground hover:bg-secondary">
                    <BarChart3 className="h-4 w-4 mr-2" />
                    ELO 랭킹(관리자)
                  </Button>
                </Link>
              )}
              {isAdmin && (
                <Link href="/admin">
                  <Button variant="outline" className="border-border text-foreground hover:bg-secondary">
                    <Users className="h-4 w-4 mr-2" />
                    클랜원 명단
                  </Button>
                </Link>
              )}
              <Link href="/ranking/public">
                <Button className="bg-violet-600 hover:bg-violet-700 text-white font-semibold shadow-md border-0">
                  <BarChart3 className="h-4 w-4 mr-2" />
                  ELO 랭킹
                </Button>
              </Link>
            </div>
          </div>
        </header>

        <section className="bg-card rounded-lg border border-border p-6 mb-8">
          <div className="flex flex-col lg:flex-row items-center gap-4">
            <div className="flex-1 w-full">
              <PlayerSearch
                label="선수(기준)"
                placeholder="선수 이름 검색..."
                value={player1}
                onChange={handlePlayer1Change}
              />
            </div>

            <div className="flex items-center justify-center px-6">
              <span className="text-3xl font-bold text-primary">VS</span>
            </div>

            <div className="flex-1 w-full">
              <PlayerSearch
                label="상대 선수"
                placeholder="상대 선수 이름 검색..."
                value={player2}
                onChange={handlePlayer2Change}
              />
            </div>

            <div className="flex-shrink-0">
              {isAdmin ? (
                <Button
                  onClick={() => setIsDialogOpen(true)}
                  disabled={members.length < 2}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-6"
                  title={members.length < 2 ? "클랜원이 2명 이상 필요합니다" : undefined}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  전적 등록
                </Button>
              ) : (
                <Button
                  type="button"
                  className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-6"
                  onClick={() =>
                    window.alert(
                      "운영진만 전적을 등록할 수 있습니다. 상단에서 관리자 로그인 후 이용해 주세요.",
                    )
                  }
                >
                  <Plus className="h-4 w-4 mr-2" />
                  전적 등록
                </Button>
              )}
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4 pt-6 border-t border-border">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground">날짜 필터</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={filterDateFrom}
                  max={filterDateTo || seoulToday}
                  onChange={(e) => handleDateFromChange(e.target.value)}
                  className="bg-input border-border text-foreground"
                />
                <span className="text-muted-foreground text-sm shrink-0">~</span>
                <Input
                  type="date"
                  value={filterDateTo}
                  min={filterDateFrom || undefined}
                  max={seoulToday}
                  onChange={(e) => handleDateToChange(e.target.value)}
                  className="bg-input border-border text-foreground"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                비워 두면 모든 날짜 · 시작일~종료일 범위 표시
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Label htmlFor="filter-map" className="text-sm font-medium text-muted-foreground">
                  맵 필터
                </Label>
                <span className="text-xs text-muted-foreground">띄어쓰기 없이 한글로만</span>
              </div>
              <Input
                id="filter-map"
                type="text"
                placeholder="비워 두면 모든 맵 · 일부 이름으로 검색"
                value={filterMap}
                onChange={(e) => handleMapChange(e.target.value)}
                className="bg-input border-border text-foreground placeholder:text-muted-foreground"
              />
              <p className="text-xs text-muted-foreground">입력한 글이 포함된 맵 이름의 전적만 표시</p>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground">경기 유형 필터</Label>
              <Select value={filterMatchType} onValueChange={handleMatchTypeChange}>
                <SelectTrigger className="bg-input border-border text-foreground">
                  <SelectValue placeholder="전체 경기 유형" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">전체</SelectItem>
                  {knownMatchTypes.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">기본값 전체</p>
            </div>
          </div>
        </section>

        {player1 && (
          <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <StatCard title="총 경기" value={totalCount} color="text-foreground" />
            <StatCard title="승리" value={wins} color="text-accent" />
            <StatCard title="패배" value={losses} color="text-destructive" />
          </section>
        )}

        <section className="bg-card rounded-lg border border-border overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                전적 기록
                {isLoadingMatches && (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </h2>
              <p className="text-sm text-muted-foreground">
                {player1
                  ? `"${player1}" 선수의 경기 기록 (총 ${totalCount}경기)`
                  : totalPages > 1
                    ? `전체 경기 기록 (${totalCount}경기 · ${currentPage}/${totalPages} 페이지)`
                    : `전체 경기 기록 (총 ${totalCount}경기)`}
              </p>
            </div>
            <Button
              type="button"
              onClick={() => setIsNoticeOpen(true)}
              className="shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold border-0"
            >
              <Megaphone className="h-4 w-4 mr-2" />
              공지 및 건의
            </Button>
          </div>

          <div className={isLoadingMatches ? "opacity-50 pointer-events-none transition-opacity" : "transition-opacity"}>
            <MatchHistory
              matches={matches}
              searchPlayer={player1}
              isAdmin={isAdmin}
              onDeleteMatch={handleDeleteMatch}
              deletePending={isDeletePending}
              onEditMatch={(match) => setEditingMatch(match)}
              editPending={isEditPending}
            />
          </div>

          {totalPages > 1 && (
            <div className="px-6 py-4 border-t border-border">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={(e) => {
                        e.preventDefault()
                        handlePageChange(currentPage - 1)
                      }}
                      aria-disabled={currentPage === 1}
                      className={currentPage === 1 ? "pointer-events-none opacity-40" : "cursor-pointer"}
                    />
                  </PaginationItem>

                  {pageNumbers.map((p, i) =>
                    p === "..." ? (
                      <PaginationItem key={`ellipsis-${i}`}>
                        <PaginationEllipsis />
                      </PaginationItem>
                    ) : (
                      <PaginationItem key={p}>
                        <PaginationLink
                          isActive={p === currentPage}
                          onClick={(e) => {
                            e.preventDefault()
                            handlePageChange(p as number)
                          }}
                          className="cursor-pointer"
                        >
                          {p}
                        </PaginationLink>
                      </PaginationItem>
                    ),
                  )}

                  <PaginationItem>
                    <PaginationNext
                      onClick={(e) => {
                        e.preventDefault()
                        handlePageChange(currentPage + 1)
                      }}
                      aria-disabled={currentPage === totalPages}
                      className={currentPage === totalPages ? "pointer-events-none opacity-40" : "cursor-pointer"}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </section>

        <AdminLoginDialog
          open={adminLoginOpen}
          onOpenChange={setAdminLoginOpen}
          onSuccess={() => router.refresh()}
        />

        <EditMatchDialog
          open={editingMatch !== null}
          onOpenChange={(open) => {
            if (!open) setEditingMatch(null)
          }}
          match={editingMatch}
          onUpdate={handleEditMatch}
          isSubmitting={isEditPending}
          knownMaps={knownMaps}
          knownMatchTypes={knownMatchTypes}
        />

        <NoticeSuggestionDialog
          open={isNoticeOpen}
          onOpenChange={setIsNoticeOpen}
          isAdmin={isAdmin}
          isCreator={isCreator ?? false}
        />

        <RegisterMatchDialog
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          members={memberOptions}
          onRegister={handleRegister}
          isSubmitting={isPending}
          prefillDate={filterDateFrom}
          prefillMap={filterMap.trim()}
          prefillMatchType={filterMatchType === "__all__" ? "" : filterMatchType}
          knownMaps={knownMaps}
          knownMatchTypes={knownMatchTypes}
        />
      </div>
    </main>
  )
}

function StatCard({ title, value, color }: { title: string; value: number; color: string }) {
  return (
    <div className="bg-card rounded-lg border border-border p-4">
      <p className="text-sm text-muted-foreground mb-1">{title}</p>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
    </div>
  )
}

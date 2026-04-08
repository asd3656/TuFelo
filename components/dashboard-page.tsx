"use client"

import { useEffect, useState, useTransition } from "react"
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Plus, Trophy, BarChart3, Users, Megaphone, Loader2, BookOpen, AlertTriangle, Sun, Moon, Monitor, Lock, FileSpreadsheet } from "lucide-react"
import { useTheme } from "next-themes"
import { getSeoulDateString } from "@/lib/date-seoul"
import type { ClanMember, Match, RegisterMatchInput, UpdateMatchInput, Season } from "@/lib/types/tufelo"
import { registerMatchAction, deleteMatchAction, updateMatchAction } from "@/app/actions/matches"
import { useMatchFilter } from "@/hooks/use-match-filter"

export type { Tier, Race, Match } from "@/lib/types/tufelo"

const PAGE_SIZE = 50

interface DashboardPageProps {
  initialMatches: Match[]
  initialTotalCount: number
  initialTotalPages: number
  knownMaps: string[]
  knownMatchTypes: string[]
  members: ClanMember[]
  isAdmin: boolean
  isCreator?: boolean
  isGuest?: boolean
  loggedInUsername?: string
  adminUsernames?: string[]
  seasons?: Season[]
  currentSeason?: Season | null
}

/** 페이지네이션 번호 배열을 생성합니다 (최대 7개, 중간 생략은 "...") */
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
  isGuest,
  loggedInUsername,
  adminUsernames = [],
  seasons = [],
  currentSeason = null,
}: DashboardPageProps) {
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const [isPending, startTransition] = useTransition()
  const [isDeletePending, startDeleteTransition] = useTransition()
  const [isEditPending, startEditTransition] = useTransition()
  const [editingMatch, setEditingMatch] = useState<Match | null>(null)
  const [isNoticeOpen, setIsNoticeOpen] = useState(false)
  const [isManualOpen, setIsManualOpen] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [adminLoginOpen, setAdminLoginOpen] = useState(false)
  const [isPageJumpOpen, setIsPageJumpOpen] = useState(false)
  const [pageJumpInput, setPageJumpInput] = useState("")

  // 필터 상태 + fetch 로직을 커스텀 훅으로 위임
  const {
    filters,
    currentPage,
    matches,
    totalCount,
    totalPages,
    wins,
    losses,
    isLoading: isLoadingMatches,
    handlePageChange,
    setPlayer1,
    setPlayer2,
    setMap,
    setDateFrom,
    setDateTo,
    setMatchType,
    setSeasonId,
  } = useMatchFilter({ initialMatches, initialTotalCount, initialTotalPages })

  const seoulToday = getSeoulDateString()
  const memberOptions = members.map((m) => ({ id: m.id, name: m.name }))
  const pageNumbers = getPageNumbers(currentPage, totalPages)

  // ── 전적 액션 핸들러 ──

  function handleRegister(input: RegisterMatchInput, keepOpen?: boolean) {
    if (!isAdmin) {
      window.alert("운영진만 전적을 등록할 수 있습니다.")
      return
    }
    startTransition(async () => {
      const res = await registerMatchAction(input)
      if (!res.ok) { window.alert(res.error); return }
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
      if (!res.ok) { window.alert(res.error); return }
      setEditingMatch(null)
      router.refresh()
    })
  }

  function handleBulkDelete(matchIds: string[]) {
    if (!isAdmin) { window.alert("운영진에게 문의하세요."); return }
    if (!window.confirm(
      `선택한 ${matchIds.length}개의 전적을 삭제할까요?\n삭제 시 양 선수의 ELO·전적이 함께 되돌아갑니다.`,
    )) return
    startDeleteTransition(async () => {
      for (const id of matchIds) {
        const res = await deleteMatchAction(id)
        if (!res.ok) { window.alert(res.error); return }
      }
      router.refresh()
    })
  }

  function handlePageJump() {
    const page = parseInt(pageJumpInput, 10)
    if (!isNaN(page) && page >= 1 && page <= totalPages) {
      handlePageChange(page, totalPages)
    }
    setIsPageJumpOpen(false)
    setPageJumpInput("")
  }

  // 날짜 필터 (미래 날짜 clamp)
  function handleDateFromChange(val: string) {
    const clamped = !val ? "" : val > seoulToday ? seoulToday : val
    setDateFrom(clamped)
  }
  function handleDateToChange(val: string) {
    const clamped = !val ? "" : val > seoulToday ? seoulToday : val
    setDateTo(clamped)
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-6xl">

        {/* ── 헤더 ── */}
        <header className="mb-10">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Trophy className="h-8 w-8 text-primary" />
                <h1 className="text-4xl font-bold text-foreground">TuF Clan ELO board</h1>
              </div>
              {adminUsernames.length > 0 && (
                <p className="text-base text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-300 dark:border-indigo-500/25 rounded-md px-2.5 py-1 w-fit font-medium">
                  관리자 : {adminUsernames.join(", ")}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2 justify-end">
              {/* 테마 토글 버튼 (system → light → dark → system) */}
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => {
                  if (theme === "system") setTheme("light")
                  else if (theme === "light") setTheme("dark")
                  else setTheme("system")
                }}
                className="border-border text-foreground hover:bg-secondary shrink-0"
                suppressHydrationWarning
                title={
                  !mounted ? undefined
                  : theme === "system" ? "시스템 설정 (클릭: 라이트 모드)"
                  : theme === "light" ? "라이트 모드 (클릭: 다크 모드)"
                  : "다크 모드 (클릭: 시스템 설정)"
                }
              >
                {!mounted ? <Monitor className="h-4 w-4" />
                  : theme === "light" ? <Sun className="h-4 w-4" />
                  : theme === "dark" ? <Moon className="h-4 w-4" />
                  : <Monitor className="h-4 w-4" />}
              </Button>
              {(isCreator || isGuest) && (
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
                {loggedInUsername ? "계정 관리" : "관리자 로그인"}
              </Button>
              {(isAdmin || isGuest) && (
                <Link href="/ranking">
                  <Button variant="outline" className="border-border text-foreground hover:bg-secondary">
                    <BarChart3 className="h-4 w-4 mr-2" />
                    ELO 랭킹(관리자)
                  </Button>
                </Link>
              )}
              {(isAdmin || isGuest) && (
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

        {/* ── 검색 & 필터 섹션 ── */}
        <section className="bg-card rounded-lg border border-border p-6 mb-8">
          <div className="flex flex-col lg:flex-row items-center gap-4">
            <div className="flex-1 w-full">
              <PlayerSearch
                label="선수(기준)"
                placeholder="선수 이름 검색..."
                value={filters.player1}
                onChange={setPlayer1}
              />
            </div>
            <div className="flex items-center justify-center px-6">
              <span className="text-3xl font-bold text-primary">VS</span>
            </div>
            <div className="flex-1 w-full">
              <PlayerSearch
                label="상대 선수"
                placeholder="상대 선수 이름 검색..."
                value={filters.player2}
                onChange={setPlayer2}
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
              ) : isGuest ? (
                <Button
                  type="button"
                  disabled
                  className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-6"
                  title="관리자 권한이 필요합니다"
                >
                  <Lock className="h-4 w-4 mr-2" />
                  전적 등록
                </Button>
              ) : (
                <Button
                  type="button"
                  className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-6"
                  onClick={() => window.alert("운영진만 전적을 등록할 수 있습니다. 상단에서 관리자 로그인 후 이용해 주세요.")}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  전적 등록
                </Button>
              )}
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 pt-6 border-t border-border">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground">날짜 필터</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={filters.dateFrom}
                  max={filters.dateTo || seoulToday}
                  onChange={(e) => handleDateFromChange(e.target.value)}
                  className="bg-input border-border text-foreground"
                />
                <span className="text-muted-foreground text-sm shrink-0">~</span>
                <Input
                  type="date"
                  value={filters.dateTo}
                  min={filters.dateFrom || undefined}
                  max={seoulToday}
                  onChange={(e) => handleDateToChange(e.target.value)}
                  className="bg-input border-border text-foreground"
                />
              </div>
              <p className="text-xs text-muted-foreground">비워 두면 모든 날짜 · 시작일~종료일 범위 표시</p>
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
                placeholder="일부이름으로 검색 가능"
                value={filters.map}
                onChange={(e) => setMap(e.target.value)}
                className="bg-input border-border text-foreground placeholder:text-muted-foreground"
              />
              <p className="text-xs text-muted-foreground">입력한 글이 포함된 맵 이름의 전적만 표시</p>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground">경기 유형 필터</Label>
              <Select value={filters.matchType} onValueChange={setMatchType}>
                <SelectTrigger className="bg-input border-border text-foreground">
                  <SelectValue placeholder="전체 경기 유형" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">전체</SelectItem>
                  {knownMatchTypes.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">기본값 전체</p>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground">시즌 필터</Label>
              <Select value={filters.seasonId} onValueChange={setSeasonId}>
                <SelectTrigger className="bg-input border-border text-foreground">
                  <SelectValue placeholder="전체 시즌" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">전체</SelectItem>
                  <SelectItem value="__none__">비시즌</SelectItem>
                  {seasons.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}{s.endDate === null ? " (현재)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">기본값 전체</p>
            </div>
          </div>
        </section>

        {/* ── 선수1 검색 시 승/패 요약 카드 ── */}
        {filters.player1 && (
          <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <StatCard title="총 경기" value={totalCount} color="text-foreground" />
            <StatCard title="승리" value={wins} color="text-accent" />
            <StatCard title="패배" value={losses} color="text-destructive" />
          </section>
        )}

        {/* ── 전적 기록 섹션 ── */}
        <section className="bg-card rounded-lg border border-border overflow-hidden">
          <div className="px-4 py-4 sm:px-6 border-b border-border flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-foreground flex flex-wrap items-center gap-2">
                전적 기록
                {isLoadingMatches && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                {currentSeason && (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/25">
                    {currentSeason.name} 진행중 · {currentSeason.startDate.replace(/-/g, ".")} ~
                  </span>
                )}
              </h2>
              <p className="text-sm text-muted-foreground">
                {filters.player1
                  ? `"${filters.player1}" 선수의 경기 기록 (총 ${totalCount}경기)`
                  : totalPages > 1
                    ? `전체 경기 기록 (${totalCount}경기 · ${currentPage}/${totalPages} 페이지)`
                    : `전체 경기 기록 (총 ${totalCount}경기)`}
              </p>
            </div>
            <div className="flex flex-col gap-2 w-full md:w-auto md:flex-row md:flex-wrap md:justify-end md:shrink-0">
              <Button
                asChild
                className="w-full md:w-auto bg-green-600 hover:bg-green-700 text-white font-semibold border-0"
              >
                <a
                  href="https://docs.google.com/spreadsheets/d/1kKeA8Y8AmO99qS6v4Xsu_95z6kdKnXL8DXLSLXoCUx8/edit?gid=501558484#gid=501558484"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  전적시트
                </a>
              </Button>
              <Button
                type="button"
                onClick={() => setIsManualOpen(true)}
                className="w-full md:w-auto bg-emerald-600 hover:bg-emerald-700 text-white font-semibold border-0"
              >
                <BookOpen className="h-4 w-4 mr-2" />
                사용설명서
              </Button>
              <Button
                type="button"
                onClick={() => setIsNoticeOpen(true)}
                className="w-full md:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-semibold border-0"
              >
                <Megaphone className="h-4 w-4 mr-2" />
                공지 및 건의
              </Button>
            </div>
          </div>

          <div className={isLoadingMatches ? "opacity-50 pointer-events-none transition-opacity" : "transition-opacity"}>
            <MatchHistory
              matches={matches}
              searchPlayer={filters.player1}
              isAdmin={isAdmin}
              isGuest={isGuest}
              deletePending={isDeletePending}
              onEditMatch={(match) => setEditingMatch(match)}
              editPending={isEditPending}
              onBulkDelete={handleBulkDelete}
            />
          </div>

          {totalPages > 1 && (
            <div className="px-6 py-4 border-t border-border">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={(e) => { e.preventDefault(); handlePageChange(currentPage - 1, totalPages) }}
                      aria-disabled={currentPage === 1}
                      className={currentPage === 1 ? "pointer-events-none opacity-40" : "cursor-pointer"}
                    />
                  </PaginationItem>

                  {pageNumbers.map((p, i) =>
                    p === "..." ? (
                      <PaginationItem key={`ellipsis-${i}`}>
                        <PaginationEllipsis
                          className="cursor-pointer rounded hover:bg-secondary/70 transition-colors"
                          onClick={() => { setPageJumpInput(""); setIsPageJumpOpen(true) }}
                          title="페이지 직접 입력"
                        />
                      </PaginationItem>
                    ) : (
                      <PaginationItem key={p}>
                        <PaginationLink
                          isActive={p === currentPage}
                          onClick={(e) => { e.preventDefault(); handlePageChange(p as number, totalPages) }}
                          className="cursor-pointer"
                        >
                          {p}
                        </PaginationLink>
                      </PaginationItem>
                    ),
                  )}

                  <PaginationItem>
                    <PaginationNext
                      onClick={(e) => { e.preventDefault(); handlePageChange(currentPage + 1, totalPages) }}
                      aria-disabled={currentPage === totalPages}
                      className={currentPage === totalPages ? "pointer-events-none opacity-40" : "cursor-pointer"}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </section>

        {/* ── 페이지 직접 이동 다이얼로그 ── */}
        <Dialog
          open={isPageJumpOpen}
          onOpenChange={(open) => {
            setIsPageJumpOpen(open)
            if (!open) setPageJumpInput("")
          }}
        >
          <DialogContent className="bg-card border-border text-foreground w-48 p-4 gap-3">
            <DialogHeader className="pb-0">
              <DialogTitle className="text-sm">페이지 이동</DialogTitle>
            </DialogHeader>
            <Input
              type="number"
              min={1}
              max={totalPages}
              value={pageJumpInput}
              onChange={(e) => setPageJumpInput(e.target.value)}
              placeholder={`1 ~ ${totalPages}`}
              className="bg-input border-border text-foreground h-8 text-sm"
              onKeyDown={(e) => { if (e.key === "Enter") handlePageJump() }}
              autoFocus
            />
            <DialogFooter className="flex-row gap-2 sm:justify-start">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setIsPageJumpOpen(false); setPageJumpInput("") }}
                className="flex-1 border-border text-foreground h-8"
              >
                취소
              </Button>
              <Button
                size="sm"
                onClick={handlePageJump}
                disabled={
                  !pageJumpInput ||
                  isNaN(parseInt(pageJumpInput, 10)) ||
                  parseInt(pageJumpInput, 10) < 1 ||
                  parseInt(pageJumpInput, 10) > totalPages
                }
                className="flex-1 bg-primary text-primary-foreground h-8"
              >
                이동
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AdminLoginDialog
          open={adminLoginOpen}
          onOpenChange={setAdminLoginOpen}
          onSuccess={() => router.refresh()}
          isLoggedIn={!!loggedInUsername}
          loggedInUsername={loggedInUsername}
        />

        <EditMatchDialog
          open={editingMatch !== null}
          onOpenChange={(open) => { if (!open) setEditingMatch(null) }}
          match={editingMatch}
          onUpdate={handleEditMatch}
          isSubmitting={isEditPending}
          knownMaps={knownMaps}
          knownMatchTypes={knownMatchTypes}
        />

        {/* ── 사용설명서 다이얼로그 ── */}
        <Dialog open={isManualOpen} onOpenChange={setIsManualOpen}>
          <DialogContent className="bg-card border-border text-foreground max-w-xl w-full max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
            <DialogHeader className="px-6 pt-6 pb-4 shrink-0 border-b border-border">
              <DialogTitle className="flex items-center gap-2 text-xl font-bold">
                <BookOpen className="h-5 w-5 text-emerald-400" />
                사용설명서
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto min-h-0">
              <div className="px-6 py-5">
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-emerald-400 shrink-0" />
                    <p className="text-sm font-bold text-emerald-300">사용설명서(26.04.08)</p>
                  </div>
                  <ul className="space-y-2 text-sm text-muted-foreground leading-relaxed">
                    <li className="flex gap-2">
                      <span className="text-emerald-400 shrink-0 mt-0.5">•</span>
                      <span>
                        날짜는 경기한 날짜가 아닌{" "}
                        <span className="text-foreground font-semibold">사이트에 등록된 날짜</span>로 등록됩니다.
                        날짜 수정이 필요한 경우 건의 게시판에 써주세요.
                      </span>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-emerald-400 shrink-0 mt-0.5">•</span>
                      <span>
                        ELO 시스템은 표준 ELO 시스템과 크게 차이가 없습니다.{" "}
                        <span className="text-foreground font-semibold">최대 상승폭은 32점</span>입니다.
                      </span>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-emerald-400 shrink-0 mt-0.5">•</span>
                      <span>
                        ELO와 승패는 매 시즌 시작과 동시에{" "}
                        <span className="text-foreground font-semibold">초기화</span>되지만 기록이 남습니다.
                        시즌은 프로리그의 시작과 동시에 갱신됩니다.
                      </span>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-emerald-400 shrink-0 mt-0.5">•</span>
                      <span>
                        ELO 초기값은{" "}
                        <span className="text-foreground font-semibold">1티어 2250, 2티어 2030, 3티어 1850, 4티어 1650</span>입니다.
                      </span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

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
          prefillDate={filters.dateFrom}
          prefillMap={filters.map.trim()}
          prefillMatchType={filters.matchType === "__all__" ? "" : filters.matchType}
          knownMaps={knownMaps}
          knownMatchTypes={knownMatchTypes}
        />
      </div>
    </main>
  )
}

/** 선수 검색 시 나타나는 통계 카드 (총 경기 / 승 / 패) */
function StatCard({ title, value, color }: { title: string; value: number; color: string }) {
  return (
    <div className="bg-card rounded-lg border border-border p-4">
      <p className="text-sm text-muted-foreground mb-1">{title}</p>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
    </div>
  )
}

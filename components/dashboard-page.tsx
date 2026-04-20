"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { PlayerSearch } from "@/components/player-search"
import { MatchHistory } from "@/components/match-history"
import { RegisterMatchDialog } from "@/components/register-match-dialog"
import { EditMatchDialog } from "@/components/edit-match-dialog"
import { NoticeSuggestionDialog } from "@/components/notice-suggestion-dialog"
import { SiteHeader } from "@/components/site-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import {
  Plus,
  Trophy,
  BarChart3,
  Users,
  Megaphone,
  Loader2,
  BookOpen,
  AlertTriangle,
  Lock,
  FileSpreadsheet,
  Coffee,
  X,
  Vote,
  Database,
  RotateCcw,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { getSeoulDateString } from "@/lib/date-seoul"
import type { ClanMember, Match, RegisterMatchInput, UpdateMatchInput, Season } from "@/lib/types/tufelo"
import { registerMatchAction, deleteMatchAction, updateMatchAction } from "@/app/actions/matches"
import { useMatchFilter } from "@/hooks/use-match-filter"
import { resolveMemberIdsByPlayerQuery } from "@/lib/resolve-member-ids-by-player-query"

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

/** 시즌 필터 가상 ID (`/api/matches` 의 `seasonId` 와 동일) */
const SEASON_FILTER_TFPL_S1 = "__tfpl_s1__"
const SEASON_FILTER_TFPL_S2 = "__tfpl_s2__"

function labelForSeasonFilterChoice(seasonId: string, seasons: Season[]): string {
  if (seasonId === SEASON_FILTER_TFPL_S1) return "시즌1"
  if (seasonId === SEASON_FILTER_TFPL_S2) return "시즌2"
  return seasons.find((s) => s.id === seasonId)?.name ?? "시즌"
}

/** 페이지네이션 번호 배열을 생성합니다 (최대 7개, 중간 생략은 "...") */
function getPageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  if (current <= 4) return [1, 2, 3, 4, 5, "...", total]
  if (current >= total - 3) return [1, "...", total - 4, total - 3, total - 2, total - 1, total]
  return [1, "...", current - 1, current, current + 1, "...", total]
}

type DashboardFabItemDef =
  | {
      id: string
      label: string
      icon: LucideIcon
      iconRingClass: string
      kind: "external"
      href: string
    }
  | {
      id: string
      label: string
      icon: LucideIcon
      iconRingClass: string
      kind: "manual"
    }
  | {
      id: string
      label: string
      icon: LucideIcon
      iconRingClass: string
      kind: "notice"
    }
  | {
      id: string
      label: string
      icon: LucideIcon
      iconRingClass: string
      kind: "comingSoon"
    }

const DASHBOARD_FAB_ITEMS: DashboardFabItemDef[] = [
  {
    id: "cafe",
    label: "카페",
    icon: Coffee,
    iconRingClass: "bg-[#03C75A] hover:bg-[#02b351]",
    kind: "external",
    href: "https://cafe.naver.com/taiscateam",
  },
  {
    id: "sheet",
    label: "전적시트",
    icon: FileSpreadsheet,
    iconRingClass: "bg-green-600 hover:bg-green-700",
    kind: "external",
    href: "https://docs.google.com/spreadsheets/d/1kKeA8Y8AmO99qS6v4Xsu_95z6kdKnXL8DXLSLXoCUx8/edit?gid=501558484#gid=501558484",
  },
  {
    id: "tfpl",
    label: "승부예측",
    icon: Vote,
    iconRingClass: "bg-violet-600 hover:bg-violet-700",
    kind: "external",
    href: "https://tufpl.vercel.app/",
  },
  {
    id: "manual",
    label: "사용설명서",
    icon: BookOpen,
    iconRingClass: "bg-emerald-600 hover:bg-emerald-700",
    kind: "manual",
  },
  {
    id: "notice",
    label: "공지 및 건의",
    icon: Megaphone,
    iconRingClass: "bg-indigo-600 hover:bg-indigo-700",
    kind: "notice",
  },
]

/** 라벨 문자 수 짧은 순(동일 길이는 한글 정렬). PC 세로: 위→아래 짧은→긴 / 모바일 col-reverse용으로 역순 사용 */
function compareFabItemsByLabelWidth(a: DashboardFabItemDef, b: DashboardFabItemDef) {
  const w = a.label.length - b.label.length
  if (w !== 0) return w
  return a.label.localeCompare(b.label, "ko")
}

const DASHBOARD_FAB_ITEMS_SORTED_ASC = [...DASHBOARD_FAB_ITEMS].sort(compareFabItemsByLabelWidth)

const fabCapsuleShellBase =
  "flex max-w-full cursor-pointer items-center rounded-full border border-border/40 bg-background/65 text-left shadow-md ring-1 ring-black/[0.06] backdrop-blur-md transition-colors hover:bg-background/82 dark:ring-white/[0.08]"
const fabCapsuleLabelBase =
  "mr-1 rounded-full border border-border/35 bg-background/50 font-medium text-foreground backdrop-blur-sm whitespace-nowrap"

const fabCapsuleSizes = {
  default: {
    shell: "min-h-10 py-1 pl-1",
    iconWrap: "h-9 w-9",
    icon: "h-5 w-5",
    label: "px-3 py-1 text-sm",
  },
  /** PC 전용 — 약 2pt(8px) 정도 더 큰 터치/클릭 영역 */
  comfortable: {
    shell: "min-h-12 py-1.5 pl-1.5",
    iconWrap: "h-11 w-11",
    icon: "h-6 w-6",
    label: "px-3.5 py-1.5 text-[0.9375rem] leading-snug",
  },
} as const

function DashboardFabCapsule({
  item,
  className,
  size = "default",
  onAfterInteract,
  onManual,
  onNotice,
}: {
  item: DashboardFabItemDef
  className?: string
  size?: keyof typeof fabCapsuleSizes
  onAfterInteract?: () => void
  onManual: () => void
  onNotice: () => void
}) {
  const Icon = item.icon
  const s = fabCapsuleSizes[size]
  const iconEl = (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full text-white shadow-sm",
        s.iconWrap,
        item.iconRingClass,
      )}
    >
      <Icon className={cn("shrink-0", s.icon)} aria-hidden />
    </span>
  )
  const labelEl = (
    <span className={cn(fabCapsuleLabelBase, s.label)}>{item.label}</span>
  )
  const shellClass = cn(fabCapsuleShellBase, s.shell, className)

  if (item.kind === "external") {
    return (
      <a
        href={item.href}
        target="_blank"
        rel="noopener noreferrer"
        className={shellClass}
        onClick={onAfterInteract}
      >
        {iconEl}
        {labelEl}
      </a>
    )
  }
  if (item.kind === "manual") {
    return (
      <button
        type="button"
        className={shellClass}
        onClick={() => {
          onAfterInteract?.()
          onManual()
        }}
      >
        {iconEl}
        {labelEl}
      </button>
    )
  }
  if (item.kind === "comingSoon") {
    return (
      <button
        type="button"
        className={shellClass}
        onClick={() => {
          onAfterInteract?.()
          window.alert("개발중입니다. 커밍쑨 by 범부")
        }}
      >
        {iconEl}
        {labelEl}
      </button>
    )
  }
  return (
    <button
      type="button"
      className={shellClass}
      onClick={() => {
        onAfterInteract?.()
        onNotice()
      }}
    >
      {iconEl}
      {labelEl}
    </button>
  )
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

  const [isPending, startTransition] = useTransition()
  const [isDeletePending, startDeleteTransition] = useTransition()
  const [isEditPending, startEditTransition] = useTransition()
  const [editingMatch, setEditingMatch] = useState<Match | null>(null)
  const [isNoticeOpen, setIsNoticeOpen] = useState(false)
  const [isManualOpen, setIsManualOpen] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isPageJumpOpen, setIsPageJumpOpen] = useState(false)
  const [pageJumpInput, setPageJumpInput] = useState("")
  /** 모바일: 기본 접힘(+만) · PC(md↑): 기본 펼침 */
  const [fabLinksOpenMobile, setFabLinksOpenMobile] = useState(false)
  const [fabLinksOpenDesktop, setFabLinksOpenDesktop] = useState(true)
  const [isMdViewport, setIsMdViewport] = useState(false)
  const [fabCapsuleSize, setFabCapsuleSize] = useState<"default" | "comfortable">("default")

  const fabLinksOpen = isMdViewport ? fabLinksOpenDesktop : fabLinksOpenMobile

  useLayoutEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)")
    const sync = () => {
      const md = mq.matches
      setIsMdViewport(md)
      setFabCapsuleSize(md ? "comfortable" : "default")
    }
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [])

  useEffect(() => {
    if (!fabLinksOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setFabLinksOpenMobile(false)
        setFabLinksOpenDesktop(false)
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [fabLinksOpen])

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
    handlePageChange: changeMatchPage,
    setPlayer1,
    setPlayer2,
    setMap,
    setDateFrom,
    setDateTo,
    setMatchTypes,
    setSeasonIds,
    setPlayer1Tiers,
    resetFilters,
  } = useMatchFilter({ initialMatches, initialTotalCount, initialTotalPages })
  const [matchTypeFilterOpen, setMatchTypeFilterOpen] = useState(false)
  const [seasonFilterOpen, setSeasonFilterOpen] = useState(false)
  const [tierFilterOpen, setTierFilterOpen] = useState(false)

  const matchHistorySectionRef = useRef<HTMLElement | null>(null)

  const scrollMatchHistoryIntoView = useCallback(() => {
    requestAnimationFrame(() => {
      matchHistorySectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    })
  }, [])

  /** 페이지네이션 시 맨 위가 아니라 전적 기록 섹션으로 스크롤 */
  function handleMatchPageChange(page: number, totalPgs: number) {
    changeMatchPage(page, totalPgs)
    scrollMatchHistoryIntoView()
  }

  const seoulToday = getSeoulDateString()
  const memberOptions = members.map((m) => ({ id: m.id, name: m.name }))
  const playerAutocompleteOptions = useMemo(
    () =>
      Array.from(new Set(members.map((m) => m.name).filter(Boolean))).sort((a, b) => a.localeCompare(b, "ko")),
    [members],
  )
  const pageNumbers = getPageNumbers(currentPage, totalPages)
  const winRate = useMemo(() => {
    if (totalCount === 0) return 0
    return (wins / totalCount) * 100
  }, [totalCount, wins])

  const hasActiveFilters = useMemo(() => {
    const f = filters
    return (
      f.player1.trim() !== "" ||
      f.player2.trim() !== "" ||
      f.dateFrom !== "" ||
      f.dateTo !== "" ||
      f.map.trim() !== "" ||
      f.matchTypes.length > 0 ||
      f.seasonIds.length > 0 ||
      f.player1Tiers.length > 0
    )
  }, [filters])

  function handleResetAllFilters() {
    resetFilters()
    setMatchTypeFilterOpen(false)
    setSeasonFilterOpen(false)
    setTierFilterOpen(false)
    scrollMatchHistoryIntoView()
  }

  /** 선수(기준) 필터와 동일 규칙으로 ID 목록 — 전적 테이블에서 기준 선수를 항상 왼쪽에 두는 데 사용 */
  const baselinePlayerIds = useMemo(() => {
    if (!filters.player1.trim()) return [] as string[]
    return resolveMemberIdsByPlayerQuery(members, filters.player1)
  }, [filters.player1, members])
  const baselinePlayerDisplayName = useMemo(() => {
    const query = filters.player1.trim()
    if (!query) return ""

    const matchedMembers = baselinePlayerIds
      .map((id) => members.find((member) => member.id === id))
      .filter((member): member is ClanMember => Boolean(member))

    if (matchedMembers.length === 1) return matchedMembers[0].name

    const q = query.toLowerCase()
    const exactMember = matchedMembers.find((member) => {
      const normalizedName = member.name.trim().toLowerCase()
      return normalizedName === q || member.id.toLowerCase() === q
    })
    return exactMember?.name ?? query
  }, [baselinePlayerIds, filters.player1, members])

  useEffect(() => {
    if (filters.player1.trim().length === 0 && filters.player2.trim().length > 0) {
      setPlayer2("")
    }
  }, [filters.player1, filters.player2, setPlayer2])

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
      handleMatchPageChange(page, totalPages)
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
      <SiteHeader
        isAdmin={isAdmin}
        isCreator={isCreator}
        isGuest={isGuest}
        loggedInUsername={loggedInUsername}
        adminUsernames={adminUsernames}
      />

      <div className="container mx-auto px-4 py-6 max-w-6xl">

        {/* ── 검색 & 필터 섹션 ── */}
        <section className="bg-card rounded-lg border border-border p-6 mb-8">
          <div className="flex flex-col lg:flex-row items-center gap-4">
            <div className="flex-1 w-full">
              <PlayerSearch
                label="선수(기준)"
                placeholder="선수 이름 검색..."
                value={filters.player1}
                onChange={setPlayer1}
                options={playerAutocompleteOptions}
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
                options={playerAutocompleteOptions}
                disabled={filters.player1.trim().length === 0}
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

          <div className="relative mt-6 border-t border-border pt-6">
            <div className="mb-3 flex justify-end xl:absolute xl:top-6 xl:right-0 xl:z-10 xl:mb-0">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8 shrink-0 border-border text-muted-foreground hover:bg-secondary hover:text-foreground"
                onClick={handleResetAllFilters}
                disabled={!hasActiveFilters}
                title={hasActiveFilters ? "모든 검색·필터 조건을 지웁니다" : "적용 중인 필터가 없습니다"}
                aria-label="필터 전체 초기화"
              >
                <RotateCcw className="h-4 w-4" aria-hidden />
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 xl:pr-11 gap-4">
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
              <DropdownMenu open={matchTypeFilterOpen} onOpenChange={setMatchTypeFilterOpen}>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-between bg-input border-border text-foreground font-normal"
                  >
                    {filters.matchTypes.length === 0
                      ? "전체 경기 유형"
                      : filters.matchTypes.length === 1
                        ? filters.matchTypes[0]
                        : `${filters.matchTypes.length}개 선택`}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64">
                  <DropdownMenuLabel>경기 유형 선택</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {knownMatchTypes.map((type) => {
                    const checked = filters.matchTypes.includes(type)
                    return (
                      <DropdownMenuCheckboxItem
                        key={type}
                        checked={checked}
                        onSelect={(e) => e.preventDefault()}
                        onCheckedChange={(isChecked) => {
                          const next = isChecked
                            ? [...filters.matchTypes, type]
                            : filters.matchTypes.filter((v) => v !== type)
                          setMatchTypes(next)
                        }}
                      >
                        {type}
                      </DropdownMenuCheckboxItem>
                    )
                  })}
                  <DropdownMenuSeparator />
                  <button
                    type="button"
                    className="w-full rounded-sm px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                    onClick={() => {
                      setMatchTypes([])
                      setMatchTypeFilterOpen(false)
                    }}
                  >
                    전체 선택(초기화)
                  </button>
                </DropdownMenuContent>
              </DropdownMenu>
              <p className="text-xs text-muted-foreground">여러 유형 동시 선택 가능 · 기본값 전체</p>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground">시즌 필터</Label>
              <DropdownMenu open={seasonFilterOpen} onOpenChange={setSeasonFilterOpen}>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-between bg-input border-border text-foreground font-normal"
                  >
                    {filters.seasonIds.length === 0
                      ? "전체 시즌"
                      : filters.seasonIds.length === 1
                        ? labelForSeasonFilterChoice(filters.seasonIds[0], seasons)
                        : `${filters.seasonIds.length}개 선택`}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64">
                  <DropdownMenuLabel>시즌 선택</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuCheckboxItem
                    checked={filters.seasonIds.includes(SEASON_FILTER_TFPL_S1)}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={(isChecked) => {
                      const next = isChecked
                        ? [...filters.seasonIds, SEASON_FILTER_TFPL_S1]
                        : filters.seasonIds.filter((v) => v !== SEASON_FILTER_TFPL_S1)
                      setSeasonIds(next)
                    }}
                  >
                    시즌1
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={filters.seasonIds.includes(SEASON_FILTER_TFPL_S2)}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={(isChecked) => {
                      const next = isChecked
                        ? [...filters.seasonIds, SEASON_FILTER_TFPL_S2]
                        : filters.seasonIds.filter((v) => v !== SEASON_FILTER_TFPL_S2)
                      setSeasonIds(next)
                    }}
                  >
                    시즌2
                  </DropdownMenuCheckboxItem>
                  {seasons.map((s) => {
                    const checked = filters.seasonIds.includes(s.id)
                    return (
                      <DropdownMenuCheckboxItem
                        key={s.id}
                        checked={checked}
                        onSelect={(e) => e.preventDefault()}
                        onCheckedChange={(isChecked) => {
                          const next = isChecked
                            ? [...filters.seasonIds, s.id]
                            : filters.seasonIds.filter((v) => v !== s.id)
                          setSeasonIds(next)
                        }}
                      >
                        {s.name}{s.endDate === null ? " (현재)" : ""}
                      </DropdownMenuCheckboxItem>
                    )
                  })}
                  <DropdownMenuSeparator />
                  <button
                    type="button"
                    className="w-full rounded-sm px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                    onClick={() => {
                      setSeasonIds([])
                      setSeasonFilterOpen(false)
                    }}
                  >
                    전체 선택(초기화)
                  </button>
                </DropdownMenuContent>
              </DropdownMenu>
              <p className="text-xs text-muted-foreground">여러 시즌 동시 선택 가능 · 기본값 전체</p>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground">티어 필터 (선수1 기준)</Label>
              <DropdownMenu open={tierFilterOpen} onOpenChange={setTierFilterOpen}>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-between bg-input border-border text-foreground font-normal"
                  >
                    {filters.player1Tiers.length === 0
                      ? "전체 티어"
                      : filters.player1Tiers.length === 1
                        ? `${filters.player1Tiers[0]}티어`
                        : `${filters.player1Tiers.length}개 선택`}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuLabel>티어 선택 (선수1 기준)</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {["1", "2", "3", "4"].map((tier) => {
                    const checked = filters.player1Tiers.includes(tier)
                    return (
                      <DropdownMenuCheckboxItem
                        key={tier}
                        checked={checked}
                        onSelect={(e) => e.preventDefault()}
                        onCheckedChange={(isChecked) => {
                          const next = isChecked
                            ? [...filters.player1Tiers, tier]
                            : filters.player1Tiers.filter((v) => v !== tier)
                          setPlayer1Tiers(next)
                        }}
                      >
                        {tier}티어
                      </DropdownMenuCheckboxItem>
                    )
                  })}
                  <DropdownMenuSeparator />
                  <button
                    type="button"
                    className="w-full rounded-sm px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                    onClick={() => {
                      setPlayer1Tiers([])
                      setTierFilterOpen(false)
                    }}
                  >
                    전체 선택(초기화)
                  </button>
                </DropdownMenuContent>
              </DropdownMenu>
              <p className="text-xs text-muted-foreground">
                여러 티어 동시 선택 가능 · 기본값 전체
              </p>
            </div>
            </div>
          </div>
        </section>

        {/* ── 선수1 검색 시 승/패 요약 카드 ── */}
        {filters.player1 && (
          <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
            <StatCard title="총 경기" value={totalCount} color="text-foreground" />
            <StatCard title="승리" value={wins} color="text-accent" />
            <StatCard title="패배" value={losses} color="text-destructive" />
            <StatCard title="승률" value={`${winRate.toFixed(1)}%`} color="text-primary" />
          </section>
        )}

        {/* ── 전적 기록 섹션 ── */}
        <section
          ref={matchHistorySectionRef}
          id="match-history"
          className="scroll-mt-4 bg-card rounded-lg border border-border overflow-hidden"
        >
          <div className="px-4 py-4 sm:px-6 border-b border-border">
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
                  ? `"${baselinePlayerDisplayName}" 선수의 경기 기록 (총 ${totalCount}경기)`
                  : totalPages > 1
                    ? `전체 경기 기록 (${totalCount}경기 · ${currentPage}/${totalPages} 페이지)`
                    : `전체 경기 기록 (총 ${totalCount}경기)`}
              </p>
            </div>
          </div>

          <div className={isLoadingMatches ? "opacity-50 pointer-events-none transition-opacity" : "transition-opacity"}>
            <MatchHistory
              matches={matches}
              rowStartNumber={(currentPage - 1) * PAGE_SIZE + 1}
              searchPlayer={filters.player1}
              baselinePlayerIds={baselinePlayerIds}
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
                      onClick={(e) => { e.preventDefault(); handleMatchPageChange(currentPage - 1, totalPages) }}
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
                          onClick={(e) => { e.preventDefault(); handleMatchPageChange(p as number, totalPages) }}
                          className="cursor-pointer"
                        >
                          {p}
                        </PaginationLink>
                      </PaginationItem>
                    ),
                  )}

                  <PaginationItem>
                    <PaginationNext
                      onClick={(e) => { e.preventDefault(); handleMatchPageChange(currentPage + 1, totalPages) }}
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
                    <p className="text-sm font-bold text-emerald-300">사용설명서(26.04.14)</p>
                  </div>
                  <ul className="space-y-2 text-sm text-muted-foreground leading-relaxed">
                    <li className="flex gap-2">
                      <span className="text-emerald-400 shrink-0 mt-0.5">•</span>
                      <span>            
                        날짜 수정이 필요한 경우 건의 게시판에 써주세요. 날짜는 <span className="text-foreground font-semibold">시트 H열(경기유형) 작성 시점</span>
                        기준으로 올라갑니다.
                      </span>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-emerald-400 shrink-0 mt-0.5">•</span>
                      <span>
                        ELO 시스템은 스타 래더 시스템과 크게 차이가 없습니다.{" "}
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
          prefillMatchType={filters.matchTypes[0] ?? ""}
          knownMaps={knownMaps}
          knownMatchTypes={knownMatchTypes}
        />

        {/* 우하단 바로가기: PC 기본 펼침 · 모바일 기본 접힘(+만) · X/배경으로 닫기 */}
        {fabLinksOpenMobile && !isMdViewport && (
          <button
            type="button"
            aria-label="바로가기 메뉴 닫기"
            className="fixed inset-0 z-40 bg-background/50 backdrop-blur-[2px] md:hidden"
            onClick={() => setFabLinksOpenMobile(false)}
          />
        )}
        <div
          className="fixed bottom-6 right-4 z-50 flex max-w-[calc(100vw-2rem)] flex-col-reverse items-end gap-3 sm:right-6 md:max-w-[calc(100vw-3rem)] md:right-6"
          role="group"
          aria-label="클랜 바로가기"
        >
          <Button
            type="button"
            size="icon"
            aria-expanded={fabLinksOpen}
            aria-controls="dashboard-fab-actions"
            title={fabLinksOpen ? "닫기" : "바로가기"}
            className={cn(
              "h-12 w-12 shrink-0 rounded-full border-0 shadow-lg",
              "bg-primary hover:bg-primary/90 text-primary-foreground",
            )}
            onClick={() =>
              isMdViewport
                ? setFabLinksOpenDesktop((o) => !o)
                : setFabLinksOpenMobile((o) => !o)
            }
          >
            {fabLinksOpen ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
          </Button>

          <div
            id="dashboard-fab-actions"
            className={cn(
              "flex flex-col-reverse items-end gap-3 transition-all duration-200 ease-out md:gap-2",
              fabLinksOpen
                ? "pointer-events-auto max-h-[1000px] translate-y-0 opacity-100"
                : "pointer-events-none max-h-0 translate-y-3 overflow-hidden opacity-0",
            )}
          >
            {[...DASHBOARD_FAB_ITEMS_SORTED_ASC].reverse().map((item) => (
              <DashboardFabCapsule
                key={item.id}
                item={item}
                size={fabCapsuleSize}
                className="shrink-0"
                onAfterInteract={() => {
                  setFabLinksOpenMobile(false)
                  setFabLinksOpenDesktop(false)
                }}
                onManual={() => setIsManualOpen(true)}
                onNotice={() => setIsNoticeOpen(true)}
              />
            ))}
          </div>
        </div>
      </div>
    </main>
  )
}

/** 선수 검색 시 나타나는 통계 카드 (총 경기 / 승 / 패) */
function StatCard({ title, value, color }: { title: string; value: number | string; color: string }) {
  return (
    <div className="bg-card rounded-lg border border-border p-4">
      <p className="text-sm text-muted-foreground mb-1">{title}</p>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
    </div>
  )
}

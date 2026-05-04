"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SiteHeader } from "@/components/site-header"
import type { SiteHeaderData } from "@/lib/data/site-header"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Shield,
  Plus,
  Trash2,
  ScrollText,
  X,
  CalendarDays,
  Pencil,
  Play,
  Lock,
  Award,
  Users,
} from "lucide-react"
import { addAdminAccountAction, deleteAdminAccountAction } from "@/app/actions/creator"
import { logoutAdminAction } from "@/app/actions/admin"
import { startNewSeasonAction, updateSeasonAction, deleteSeasonAction, syncCurrentSeasonStatsAction } from "@/app/actions/seasons"
import {
  createDecorativeBadgeAction,
  deleteDecorativeBadgeAction,
  setDecorativeBadgeMembersAction,
  updateDecorativeBadgeAction,
} from "@/app/actions/decorative-badges"
import type { CreatorDecorativeBadge } from "@/lib/data/decorative-badges"
import type { DecorativeBadgeAccent } from "@/lib/decorative-badge-accent"
import { DECORATIVE_BADGE_ACCENT_OPTIONS, decorativeBadgeAccentClasses } from "@/lib/decorative-badge-accent"
import type { Season } from "@/lib/types/tufelo"

interface AdminRow {
  username: string
  role: string
  created_at: string
}

interface LogRow {
  id: string
  admin_username: string
  action: string
  target: string | null
  detail: string | null
  created_at: string
}

interface CreatorPageClientProps {
  currentUsername: string
  admins: AdminRow[]
  logs: LogRow[]
  seasons: Season[]
  decorativeBadges: CreatorDecorativeBadge[]
  badgeMembers: { id: string; name: string }[]
  isGuest?: boolean
  headerData: SiteHeaderData
}

const ACTION_OPTIONS = [
  "__all__",
  "전적 등록",
  "전적 수정",
  "전적 삭제",
  "클랜원 추가",
  "클랜원 수정",
  "클랜원 탈퇴처리",
  "클랜원 복귀처리",
  "클랜원 완전삭제",
  "관리자 추가",
  "관리자 삭제",
  "건의사항 삭제",
  "시즌 시작",
  "시즌 수정",
  "시즌 삭제",
  "시즌 전적 재동기화",
  "전역 뱃지 생성",
  "전역 뱃지 수정",
  "전역 뱃지 삭제",
  "전역 뱃지 부여",
] as const

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  })
}

function toSeoulDateString(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Seoul",
  }).replace(/\. /g, "-").replace(".", "").trim()
}

function actionBadgeClass(action: string) {
  if (action.includes("삭제") || action.includes("탈퇴")) return "bg-destructive/10 text-destructive"
  if (action.includes("추가") || action.includes("등록")) return "bg-primary/10 text-primary"
  if (action.includes("복귀") || action.includes("수정")) return "bg-amber-500/10 text-amber-400"
  return "bg-secondary text-secondary-foreground"
}

function parseElapsedMs(detail: string | null): number | null {
  if (!detail) return null
  const m = detail.match(/(?:^|,\s*)elapsed_ms=(\d+)(?:,|$)/)
  if (!m) return null
  const parsed = Number(m[1])
  return Number.isFinite(parsed) ? parsed : null
}

export function CreatorPageClient({
  currentUsername,
  admins,
  logs,
  seasons,
  decorativeBadges,
  badgeMembers,
  isGuest,
  headerData,
}: CreatorPageClientProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  // 관리자 추가 폼
  const [newUsername, setNewUsername] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [formErr, setFormErr] = useState<string | null>(null)

  // 계정 삭제 확인
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  // ── 시즌 관리 상태 ──
  const [seasonErr, setSeasonErr] = useState<string | null>(null)
  const [seasonNotice, setSeasonNotice] = useState<string | null>(null)
  // 새 시즌 시작 폼
  const [newSeasonName, setNewSeasonName] = useState("")
  const [newSeasonStart, setNewSeasonStart] = useState("")
  const [showNewSeasonForm, setShowNewSeasonForm] = useState(false)
  const [confirmNewSeason, setConfirmNewSeason] = useState(false)
  // 시즌 수정
  const [editingSeason, setEditingSeason] = useState<Season | null>(null)
  const [editName, setEditName] = useState("")
  const [editStart, setEditStart] = useState("")
  const [editEnd, setEditEnd] = useState("")
  // 시즌 삭제 확인
  const [deleteSeasonTarget, setDeleteSeasonTarget] = useState<Season | null>(null)
  const [syncingSeasonStats, setSyncingSeasonStats] = useState(false)

  const [newBadgeLabel, setNewBadgeLabel] = useState("")
  const [newBadgeSort, setNewBadgeSort] = useState("0")
  const [newBadgeAccent, setNewBadgeAccent] = useState<DecorativeBadgeAccent>("amber")
  const [editBadge, setEditBadge] = useState<CreatorDecorativeBadge | null>(null)
  const [editBadgeLabel, setEditBadgeLabel] = useState("")
  const [editBadgeSort, setEditBadgeSort] = useState("0")
  const [editBadgeAccent, setEditBadgeAccent] = useState<DecorativeBadgeAccent>("amber")
  const [assignBadge, setAssignBadge] = useState<CreatorDecorativeBadge | null>(null)
  const [assignSelected, setAssignSelected] = useState<Set<string>>(() => new Set())
  const [assignFilter, setAssignFilter] = useState("")
  const [deleteBadgeTarget, setDeleteBadgeTarget] = useState<CreatorDecorativeBadge | null>(null)

  const activeSeason = seasons.find((s) => s.endDate === null) ?? null

  function handleStartNewSeason(e: React.FormEvent) {
    e.preventDefault()
    setSeasonErr(null)
    if (!newSeasonName.trim() || !newSeasonStart) {
      setSeasonErr("시즌 이름과 시작 날짜를 모두 입력하세요.")
      return
    }
    setConfirmNewSeason(true)
  }

  function confirmAndStartSeason() {
    setConfirmNewSeason(false)
    startTransition(async () => {
      const res = await startNewSeasonAction({ name: newSeasonName.trim(), startDate: newSeasonStart })
      if (!res.ok) { setSeasonErr(res.error); return }
      setNewSeasonName("")
      setNewSeasonStart("")
      setShowNewSeasonForm(false)
      router.refresh()
    })
  }

  function handleOpenEdit(season: Season) {
    setEditingSeason(season)
    setEditName(season.name)
    setEditStart(season.startDate)
    setEditEnd(season.endDate ?? "")
    setSeasonErr(null)
  }

  function handleSaveEdit() {
    if (!editingSeason) return
    setSeasonErr(null)
    startTransition(async () => {
      const res = await updateSeasonAction({
        id: editingSeason.id,
        name: editName.trim(),
        startDate: editStart,
        endDate: editEnd || null,
      })
      if (!res.ok) { setSeasonErr(res.error); return }
      setEditingSeason(null)
      router.refresh()
    })
  }

  function handleDeleteSeason() {
    if (!deleteSeasonTarget) return
    startTransition(async () => {
      const res = await deleteSeasonAction(deleteSeasonTarget.id)
      if (!res.ok) { window.alert(res.error); return }
      setDeleteSeasonTarget(null)
      router.refresh()
    })
  }

  function handleSyncCurrentSeasonStats() {
    if (syncingSeasonStats) return
    setSeasonErr(null)
    setSeasonNotice(null)
    setSyncingSeasonStats(true)
    startTransition(async () => {
      try {
        const timeoutMs = 60_000
        const res = await Promise.race([
          syncCurrentSeasonStatsAction(),
          new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error("요청 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.")), timeoutMs)
          }),
        ])
        if (!res.ok) {
          setSeasonErr(res.error)
          window.alert(res.error)
          return
        }
        setSeasonNotice("현재 시즌 전적 재동기화가 완료되었습니다.")
        window.alert("현재 시즌 전적 재동기화가 완료되었습니다.")
        router.refresh()
      } catch (e) {
        const message = `재동기화 요청 실패: ${String(e)}`
        setSeasonErr(message)
        window.alert(message)
      } finally {
        setSyncingSeasonStats(false)
      }
    })
  }

  // 로그 필터
  const [filterAdmin, setFilterAdmin] = useState("")
  const [filterTarget, setFilterTarget] = useState("")
  const [filterAction, setFilterAction] = useState("__all__")
  const [filterDateFrom, setFilterDateFrom] = useState("")
  const [filterDateTo, setFilterDateTo] = useState("")

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (filterAdmin && !log.admin_username.toLowerCase().includes(filterAdmin.toLowerCase())) return false
      if (filterTarget && !(log.target ?? "").toLowerCase().includes(filterTarget.toLowerCase())) return false
      if (filterAction !== "__all__" && log.action !== filterAction) return false
      if (filterDateFrom || filterDateTo) {
        const logDate = toSeoulDateString(log.created_at)
        if (filterDateFrom && logDate < filterDateFrom) return false
        if (filterDateTo && logDate > filterDateTo) return false
      }
      return true
    })
  }, [logs, filterAdmin, filterTarget, filterAction, filterDateFrom, filterDateTo])

  const hasFilter = filterAdmin || filterTarget || filterAction !== "__all__" || filterDateFrom || filterDateTo

  function resetFilters() {
    setFilterAdmin("")
    setFilterTarget("")
    setFilterAction("__all__")
    setFilterDateFrom("")
    setFilterDateTo("")
  }

  function handleAddAdmin(e: React.FormEvent) {
    e.preventDefault()
    setFormErr(null)
    startTransition(async () => {
      const res = await addAdminAccountAction({ username: newUsername, password: newPassword })
      if (!res.ok) { setFormErr(res.error); return }
      setNewUsername("")
      setNewPassword("")
      router.refresh()
    })
  }

  function handleDeleteAdmin() {
    if (!deleteTarget) return
    startTransition(async () => {
      const res = await deleteAdminAccountAction(deleteTarget)
      if (!res.ok) { window.alert(res.error); return }
      setDeleteTarget(null)
      router.refresh()
    })
  }

  function handleLogout() {
    startTransition(async () => {
      await logoutAdminAction()
      router.push("/")
    })
  }

  const filteredAssignMembers = useMemo(() => {
    const q = assignFilter.trim().toLowerCase()
    if (!q) return badgeMembers
    return badgeMembers.filter((m) => m.name.toLowerCase().includes(q))
  }, [badgeMembers, assignFilter])

  function openAssignDialog(b: CreatorDecorativeBadge) {
    setAssignBadge(b)
    setAssignSelected(new Set(b.memberIds))
    setAssignFilter("")
  }

  function toggleAssignMember(id: string) {
    setAssignSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleSaveAssign() {
    if (!assignBadge) return
    startTransition(async () => {
      const res = await setDecorativeBadgeMembersAction({
        badgeId: assignBadge.id,
        memberIds: [...assignSelected],
      })
      if (!res.ok) {
        window.alert(res.error)
        return
      }
      setAssignBadge(null)
      router.refresh()
    })
  }

  function handleCreateBadge(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const res = await createDecorativeBadgeAction({
        label: newBadgeLabel,
        sortOrder: Number(newBadgeSort) || 0,
        accent: newBadgeAccent,
      })
      if (!res.ok) {
        window.alert(res.error)
        return
      }
      setNewBadgeLabel("")
      setNewBadgeSort("0")
      setNewBadgeAccent("amber")
      router.refresh()
    })
  }

  function handleUpdateBadge() {
    if (!editBadge) return
    startTransition(async () => {
      const res = await updateDecorativeBadgeAction({
        id: editBadge.id,
        label: editBadgeLabel,
        sortOrder: Number(editBadgeSort) || 0,
        accent: editBadgeAccent,
      })
      if (!res.ok) {
        window.alert(res.error)
        return
      }
      setEditBadge(null)
      router.refresh()
    })
  }

  function handleDeleteBadgeConfirm() {
    if (!deleteBadgeTarget) return
    startTransition(async () => {
      const res = await deleteDecorativeBadgeAction(deleteBadgeTarget.id)
      if (!res.ok) {
        window.alert(res.error)
        return
      }
      setDeleteBadgeTarget(null)
      router.refresh()
    })
  }

  return (
    <main className="min-h-screen bg-background">
      <SiteHeader
        isAdmin={headerData.isAdmin}
        isCreator={headerData.isCreator}
        isGuest={headerData.isGuest}
        loggedInUsername={headerData.loggedInUsername}
        adminUsernames={headerData.adminUsernames}
      />
      <div className="container mx-auto px-4 py-8 max-w-5xl">

        {/* 헤더 */}
        <header className="mb-10">
          <div className="flex items-center justify-between gap-4 mb-2">
            <div className="flex items-center gap-3">
              <Shield className="h-8 w-8 text-red-500" />
              <h1 className="text-3xl font-bold text-foreground">제작자 페이지</h1>
            </div>
            {!isGuest && (
              <Button
                variant="outline"
                className="border-border text-muted-foreground hover:text-foreground"
                onClick={handleLogout}
                disabled={pending}
              >
                로그아웃
              </Button>
            )}
          </div>
          <p className="text-muted-foreground">
            로그인 중: <span className="text-foreground font-semibold">{currentUsername}</span>
            {isGuest ? (
              <Badge className="ml-2 bg-blue-100 dark:bg-blue-600/20 text-blue-700 dark:text-blue-400 border-blue-400/60 dark:border-blue-500/30">손님 (읽기 전용)</Badge>
            ) : (
              <Badge className="ml-2 bg-red-100 dark:bg-red-600/20 text-red-700 dark:text-red-400 border-red-400/60 dark:border-red-500/30">제작자</Badge>
            )}
          </p>
        </header>

        {/* 시즌 관리 */}
        <section className="bg-card rounded-lg border border-border overflow-hidden mb-8">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-primary" />
                시즌 관리
              </h2>
              <p className="text-sm text-muted-foreground">
                {activeSeason
                  ? `현재 진행 중: ${activeSeason.name} (${activeSeason.startDate} ~ )`
                  : "현재 진행 중인 시즌 없음"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {activeSeason && (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-border text-foreground hover:bg-secondary"
                  onClick={handleSyncCurrentSeasonStats}
                  disabled={isGuest || pending || syncingSeasonStats}
                  title={isGuest ? "관리자 권한이 필요합니다" : "현재 시즌 전적 재동기화"}
                >
                  {isGuest ? <Lock className="h-4 w-4 mr-1" /> : <ScrollText className="h-4 w-4 mr-1" />}
                  {syncingSeasonStats ? "재동기화 중..." : "전적 재동기화"}
                </Button>
              )}
              <Button
                size="sm"
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
                onClick={() => { setShowNewSeasonForm((v) => !v); setSeasonErr(null) }}
                disabled={isGuest || pending}
              >
                {isGuest ? <Lock className="h-4 w-4 mr-1" /> : <Play className="h-4 w-4 mr-1" />}
                새 시즌 시작
              </Button>
            </div>
          </div>
          {seasonNotice && (
            <div className="px-6 py-2 border-b border-border bg-emerald-500/10 text-emerald-300 text-sm">
              {seasonNotice}
            </div>
          )}

          {/* 새 시즌 시작 폼 */}
          {showNewSeasonForm && (
            <div className="px-6 py-5 border-b border-border bg-secondary/20">
              <p className="text-sm font-semibold text-foreground mb-3">새 시즌 정보 입력</p>
              {activeSeason && (
                <p className="text-xs text-amber-400 mb-3">
                  ⚠ &quot;{activeSeason.name}&quot;이(가) 자동 종료되고 모든 활성 선수의 ELO/승패/연속이 초기화됩니다.
                </p>
              )}
              <form onSubmit={handleStartNewSeason} className="flex flex-wrap gap-3 items-end">
                <div className="space-y-1.5 flex-1 min-w-32">
                  <Label className="text-xs text-muted-foreground">시즌 이름</Label>
                  <Input
                    placeholder="예: 시즌3"
                    value={newSeasonName}
                    onChange={(e) => setNewSeasonName(e.target.value)}
                    className="bg-input border-border"
                  />
                </div>
                <div className="space-y-1.5 min-w-40">
                  <Label className="text-xs text-muted-foreground">시작 날짜</Label>
                  <Input
                    type="date"
                    value={newSeasonStart}
                    onChange={(e) => setNewSeasonStart(e.target.value)}
                    className="bg-input border-border"
                  />
                </div>
                <Button type="submit" disabled={pending} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                  <Plus className="h-4 w-4 mr-1" />
                  시작
                </Button>
                <Button type="button" variant="ghost" disabled={pending} onClick={() => setShowNewSeasonForm(false)}>
                  취소
                </Button>
              </form>
              {seasonErr && <p className="text-sm text-destructive mt-2">{seasonErr}</p>}
            </div>
          )}

          {/* 시즌 목록 */}
          {seasons.length === 0 ? (
            <div className="px-6 py-10 text-center text-muted-foreground text-sm">
              아직 시즌이 없습니다.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-muted-foreground font-semibold">시즌명</TableHead>
                    <TableHead className="text-muted-foreground font-semibold text-center">시작일</TableHead>
                    <TableHead className="text-muted-foreground font-semibold text-center">종료일</TableHead>
                    <TableHead className="text-muted-foreground font-semibold text-center">상태</TableHead>
                    <TableHead className="text-muted-foreground font-semibold text-center w-24">관리</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {seasons.map((season) => (
                    <TableRow key={season.id} className="border-border hover:bg-secondary/50">
                      {editingSeason?.id === season.id ? (
                        <>
                          <TableCell>
                            <Input
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="bg-input border-border h-8 text-sm"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="date"
                              value={editStart}
                              onChange={(e) => setEditStart(e.target.value)}
                              className="bg-input border-border h-8 text-sm"
                            />
                          </TableCell>
                          <TableCell>
                            {season.endDate !== null ? (
                              <Input
                                type="date"
                                value={editEnd}
                                onChange={(e) => setEditEnd(e.target.value)}
                                className="bg-input border-border h-8 text-sm"
                              />
                            ) : (
                              <span className="text-xs text-muted-foreground">진행 중</span>
                            )}
                          </TableCell>
                          <TableCell />
                          <TableCell className="text-center">
                            <div className="flex justify-center gap-1">
                              <Button
                                size="sm"
                                className="h-7 px-2 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
                                onClick={handleSaveEdit}
                                disabled={isGuest || pending}
                              >
                                저장
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-xs"
                                onClick={() => setEditingSeason(null)}
                                disabled={isGuest || pending}
                              >
                                취소
                              </Button>
                            </div>
                            {seasonErr && editingSeason?.id === season.id && (
                              <p className="text-xs text-destructive mt-1">{seasonErr}</p>
                            )}
                          </TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell className="font-semibold text-foreground">{season.name}</TableCell>
                          <TableCell className="text-center text-sm text-muted-foreground">{season.startDate}</TableCell>
                          <TableCell className="text-center text-sm text-muted-foreground">
                            {season.endDate ?? "—"}
                          </TableCell>
                          <TableCell className="text-center">
                            {season.endDate === null ? (
                              <Badge className="bg-primary/20 text-primary border-primary/30">진행 중</Badge>
                            ) : (
                              <Badge variant="outline" className="text-muted-foreground">종료</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex justify-center items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-secondary/80"
                                onClick={() => handleOpenEdit(season)}
                                disabled={isGuest || pending}
                                title={isGuest ? "관리자 권한이 필요합니다" : "수정"}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                onClick={() => setDeleteSeasonTarget(season)}
                                disabled={isGuest || pending}
                                title={isGuest ? "관리자 권한이 필요합니다" : "삭제"}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                              {isGuest && <Lock className="h-3.5 w-3.5 text-muted-foreground/50" />}
                            </div>
                          </TableCell>
                        </>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>

        {/* 전역 장식 뱃지 (데이터센터 프로필) */}
        <section className="bg-card rounded-lg border border-border overflow-hidden mb-8">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Award className="h-5 w-5 text-amber-500" />
              전역 장식 뱃지
            </h2>
            <p className="text-sm text-muted-foreground">
              표시 문구를 직접 입력합니다. 예: 개인리그{" "}
              <span className="font-mono text-xs text-amber-600/90 dark:text-amber-400/90">TFSL S2 우승자</span>, 팀 리그{" "}
              <span className="font-mono text-xs text-amber-600/90 dark:text-amber-400/90">TFPL S2 우승 발할라</span> — 부여
              선수만 데이터센터에 뱃지가 보입니다.
            </p>
          </div>

          <div className="px-6 py-4 border-b border-border bg-secondary/15">
            <p className="text-sm font-semibold text-foreground mb-3">새 뱃지</p>
            <form onSubmit={handleCreateBadge} className="flex flex-wrap gap-3 items-end">
              <div className="space-y-1.5 flex-1 min-w-[12rem]">
                <Label className="text-xs text-muted-foreground">표시 문구</Label>
                <Input
                  placeholder="예: TFPL S2 우승 발할라"
                  value={newBadgeLabel}
                  onChange={(e) => setNewBadgeLabel(e.target.value)}
                  className="bg-input border-border"
                  maxLength={200}
                  disabled={isGuest}
                />
              </div>
              <div className="space-y-1.5 w-24">
                <Label className="text-xs text-muted-foreground">정렬</Label>
                <Input
                  type="number"
                  value={newBadgeSort}
                  onChange={(e) => setNewBadgeSort(e.target.value)}
                  className="bg-input border-border"
                  disabled={isGuest}
                />
              </div>
              <div className="space-y-1.5 w-[8.5rem]">
                <Label className="text-xs text-muted-foreground">색상</Label>
                <Select value={newBadgeAccent} onValueChange={(v) => setNewBadgeAccent(v as DecorativeBadgeAccent)} disabled={isGuest}>
                  <SelectTrigger className="bg-input border-border h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DECORATIVE_BADGE_ACCENT_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="submit"
                disabled={isGuest || pending || !newBadgeLabel.trim()}
                className="bg-amber-600 hover:bg-amber-700 text-white"
                title={isGuest ? "제작자 권한이 필요합니다" : undefined}
              >
                {isGuest ? <Lock className="h-4 w-4 mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
                추가
              </Button>
            </form>
          </div>

          {decorativeBadges.length === 0 ? (
            <div className="px-6 py-8 text-center text-sm text-muted-foreground">등록된 뱃지가 없습니다.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-muted-foreground font-semibold">표시 문구</TableHead>
                    <TableHead className="text-muted-foreground font-semibold text-center w-36">미리보기</TableHead>
                    <TableHead className="text-muted-foreground font-semibold text-center w-20">정렬</TableHead>
                    <TableHead className="text-muted-foreground font-semibold text-center w-24">
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        인원
                      </span>
                    </TableHead>
                    <TableHead className="text-muted-foreground font-semibold text-center w-44">관리</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {decorativeBadges.map((b) => (
                    <TableRow key={b.id} className="border-border hover:bg-secondary/50">
                      <TableCell className="font-medium text-foreground max-w-[min(28rem,55vw)]">
                        <span className="line-clamp-2">{b.label}</span>
                      </TableCell>
                      <TableCell className="text-center align-middle">
                        <div className="flex justify-center">
                          <Badge variant="outline" className={`max-w-[10rem] truncate ${decorativeBadgeAccentClasses(b.accent)}`} title={b.label}>
                            {b.label}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-center tabular-nums text-muted-foreground">{b.sortOrder}</TableCell>
                      <TableCell className="text-center">{b.memberIds.length}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex flex-wrap justify-center gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 border-border"
                            onClick={() => openAssignDialog(b)}
                            disabled={isGuest || pending}
                          >
                            부여
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8"
                            onClick={() => {
                              setEditBadge(b)
                              setEditBadgeLabel(b.label)
                              setEditBadgeSort(String(b.sortOrder))
                              setEditBadgeAccent(b.accent)
                            }}
                            disabled={isGuest || pending}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 text-destructive hover:text-destructive"
                            onClick={() => setDeleteBadgeTarget(b)}
                            disabled={isGuest || pending}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                          {isGuest && <Lock className="h-3.5 w-3.5 text-muted-foreground/50" />}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>

        {/* 관리자 계정 관리 */}
        <section className="bg-card rounded-lg border border-border overflow-hidden mb-8">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              관리자 계정 관리
            </h2>
            <p className="text-sm text-muted-foreground">관리자를 추가하거나 삭제합니다</p>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground font-semibold">아이디</TableHead>
                  <TableHead className="text-muted-foreground font-semibold text-center">역할</TableHead>
                  <TableHead className="text-muted-foreground font-semibold text-center">등록일</TableHead>
                  <TableHead className="text-muted-foreground font-semibold text-center w-20">삭제</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {admins.map((admin) => (
                  <TableRow key={admin.username} className="border-border hover:bg-secondary/50">
                    <TableCell className="font-semibold text-foreground">{admin.username}</TableCell>
                    <TableCell className="text-center">
                      {admin.role === "creator" ? (
                        <Badge className="bg-red-100 dark:bg-red-600/20 text-red-700 dark:text-red-400 border-red-400/60 dark:border-red-500/30">제작자</Badge>
                      ) : admin.role === "guest" ? (
                        <Badge variant="outline" className="bg-blue-100 dark:bg-blue-600/20 text-blue-700 dark:text-blue-400 border-blue-400/60 dark:border-blue-500/30">손님</Badge>
                      ) : (
                        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">관리자</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center text-muted-foreground text-sm">
                      {formatDate(admin.created_at)}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        {admin.role !== "creator" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setDeleteTarget(admin.username)}
                            disabled={isGuest || pending}
                            title={isGuest ? "관리자 권한이 필요합니다" : "삭제"}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                        {isGuest && admin.role !== "creator" && <Lock className="h-3.5 w-3.5 text-muted-foreground/50" />}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* 신규 관리자 추가 폼 */}
          <div className="px-6 py-5 border-t border-border">
            <p className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Plus className="h-4 w-4" />
              신규 관리자 추가
            </p>
            <form onSubmit={handleAddAdmin} className="flex flex-wrap gap-3 items-end">
              <div className="space-y-1.5 flex-1 min-w-32">
                <Label className="text-xs text-muted-foreground">아이디</Label>
                <Input
                  placeholder="새 아이디"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="bg-input border-border"
                  autoComplete="off"
                  disabled={isGuest}
                />
              </div>
              <div className="space-y-1.5 flex-1 min-w-32">
                <Label className="text-xs text-muted-foreground">비밀번호</Label>
                <Input
                  type="password"
                  placeholder="초기 비밀번호"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="bg-input border-border"
                  autoComplete="new-password"
                  disabled={isGuest}
                />
              </div>
              <Button
                type="submit"
                disabled={isGuest || pending}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
                title={isGuest ? "관리자 권한이 필요합니다" : undefined}
              >
                {isGuest ? <Lock className="h-4 w-4 mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
                추가
              </Button>
            </form>
            {formErr && <p className="text-sm text-destructive mt-2">{formErr}</p>}
          </div>
        </section>

        {/* 활동 로그 */}
        <section className="bg-card rounded-lg border border-border overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <ScrollText className="h-5 w-5 text-primary" />
              활동 로그
            </h2>
            <p className="text-sm text-muted-foreground">
              최근 200개 기록 (최신순)
              {hasFilter && (
                <span className="ml-2 text-primary">· 필터 적용 중 — {filteredLogs.length}건</span>
              )}
            </p>
          </div>

          {/* 필터 영역 */}
          <div className="px-6 py-4 border-b border-border bg-secondary/20">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="space-y-1 flex-1 min-w-28">
                <Label className="text-xs text-muted-foreground">관리자</Label>
                <Input
                  placeholder="아이디 검색"
                  value={filterAdmin}
                  onChange={(e) => setFilterAdmin(e.target.value)}
                  className="bg-input border-border h-8 text-sm"
                />
              </div>
              <div className="space-y-1 flex-1 min-w-28">
                <Label className="text-xs text-muted-foreground">대상</Label>
                <Input
                  placeholder="대상 검색"
                  value={filterTarget}
                  onChange={(e) => setFilterTarget(e.target.value)}
                  className="bg-input border-border h-8 text-sm"
                />
              </div>
              <div className="space-y-1 min-w-36">
                <Label className="text-xs text-muted-foreground">액션</Label>
                <Select value={filterAction} onValueChange={setFilterAction}>
                  <SelectTrigger className="bg-input border-border h-8 text-sm w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTION_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {opt === "__all__" ? "전체 액션" : opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 min-w-36">
                <Label className="text-xs text-muted-foreground">시작일</Label>
                <Input
                  type="date"
                  value={filterDateFrom}
                  max={filterDateTo || undefined}
                  onChange={(e) => setFilterDateFrom(e.target.value)}
                  className="bg-input border-border h-8 text-sm"
                />
              </div>
              <div className="space-y-1 min-w-36">
                <Label className="text-xs text-muted-foreground">종료일</Label>
                <Input
                  type="date"
                  value={filterDateTo}
                  min={filterDateFrom || undefined}
                  onChange={(e) => setFilterDateTo(e.target.value)}
                  className="bg-input border-border h-8 text-sm"
                />
              </div>
              {hasFilter && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={resetFilters}
                  className="text-muted-foreground hover:text-foreground h-8 gap-1"
                >
                  <X className="h-3.5 w-3.5" />
                  초기화
                </Button>
              )}
            </div>
          </div>

          {filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <ScrollText className="h-12 w-12 mb-4 opacity-50" />
              <p className="text-lg">{hasFilter ? "필터 조건에 맞는 기록이 없습니다" : "아직 활동 기록이 없습니다"}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-muted-foreground font-semibold text-center w-40">시각</TableHead>
                    <TableHead className="text-muted-foreground font-semibold text-center w-24">관리자</TableHead>
                    <TableHead className="text-muted-foreground font-semibold text-center w-32">액션</TableHead>
                    <TableHead className="text-muted-foreground font-semibold">대상</TableHead>
                    <TableHead className="text-muted-foreground font-semibold">상세</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map((log) => (
                    <TableRow key={log.id} className="border-border hover:bg-secondary/50">
                      <TableCell className="text-center text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(log.created_at)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="text-xs border-primary/30 text-primary">
                          {log.admin_username}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${actionBadgeClass(log.action)}`}>
                          {log.action}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-foreground">{log.target ?? "-"}</TableCell>
                      <TableCell
                        className={`text-xs ${
                          (() => {
                            const elapsedMs = parseElapsedMs(log.detail)
                            if (elapsedMs === null) return "text-muted-foreground"
                            if (elapsedMs >= 20000) return "text-destructive font-semibold"
                            if (elapsedMs >= 10000) return "text-amber-400 font-medium"
                            return "text-emerald-400"
                          })()
                        }`}
                      >
                        {log.detail ?? "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      </div>

      {/* 새 시즌 시작 확인 다이얼로그 */}
      <AlertDialog open={confirmNewSeason} onOpenChange={(v) => { if (!v) setConfirmNewSeason(false) }}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">새 시즌 시작 확인</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              <span className="text-foreground font-semibold">{newSeasonName}</span> 시즌을 시작합니다.
              {activeSeason && (
                <>
                  <br />현재 진행 중인 <span className="text-foreground font-semibold">{activeSeason.name}</span>이(가) 자동으로 종료되고
                  스냅샷이 저장됩니다.
                </>
              )}
              <br />모든 활성 선수의 <span className="text-foreground font-semibold">ELO, 승패, 연속 기록이 초기화</span>됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border text-foreground">취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmAndStartSeason}
              disabled={pending}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              시작
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 시즌 삭제 확인 다이얼로그 */}
      <AlertDialog open={!!deleteSeasonTarget} onOpenChange={(v) => { if (!v) setDeleteSeasonTarget(null) }}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">시즌 삭제</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              <span className="text-foreground font-semibold">{deleteSeasonTarget?.name}</span> 시즌을 삭제하시겠습니까?
              {deleteSeasonTarget?.endDate === null && (
                <>
                  <br />현재 활성 시즌입니다. 경기가 없는 경우에만 삭제 가능하며,
                  이전 시즌이 있으면 자동으로 복원됩니다.
                </>
              )}
              {deleteSeasonTarget?.endDate !== null && (
                <>
                  <br />이 시즌의 랭킹 스냅샷도 함께 삭제됩니다.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border text-foreground">취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSeason}
              disabled={pending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 계정 삭제 확인 다이얼로그 */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null) }}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">관리자 계정 삭제</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              <span className="text-foreground font-semibold">{deleteTarget}</span> 계정을 삭제하시겠습니까?
              <br />삭제된 계정은 더 이상 로그인할 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border text-foreground">취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAdmin}
              disabled={pending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 전역 뱃지 수정 */}
      <Dialog open={!!editBadge} onOpenChange={(v) => { if (!v) setEditBadge(null) }}>
        <DialogContent className="bg-card border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">뱃지 수정</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">표시 문구</Label>
              <Input
                value={editBadgeLabel}
                onChange={(e) => setEditBadgeLabel(e.target.value)}
                className="bg-input border-border"
                maxLength={200}
                disabled={pending}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">정렬</Label>
              <Input
                type="number"
                value={editBadgeSort}
                onChange={(e) => setEditBadgeSort(e.target.value)}
                className="bg-input border-border"
                disabled={pending}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">색상</Label>
              <Select value={editBadgeAccent} onValueChange={(v) => setEditBadgeAccent(v as DecorativeBadgeAccent)} disabled={pending}>
                <SelectTrigger className="bg-input border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DECORATIVE_BADGE_ACCENT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" className="border-border" onClick={() => setEditBadge(null)} disabled={pending}>
              취소
            </Button>
            <Button
              type="button"
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={handleUpdateBadge}
              disabled={pending || !editBadgeLabel.trim()}
            >
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 전역 뱃지 부여 */}
      <Dialog open={!!assignBadge} onOpenChange={(v) => { if (!v) setAssignBadge(null) }}>
        <DialogContent className="bg-card border-border sm:max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-foreground">이 뱃지를 부여할 선수</DialogTitle>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {assignBadge ? (
                <Badge variant="outline" className={decorativeBadgeAccentClasses(assignBadge.accent)} title={assignBadge.label}>
                  {assignBadge.label}
                </Badge>
              ) : null}
            </div>
          </DialogHeader>
          <div className="space-y-3 flex-1 min-h-0 flex flex-col">
            <Input
              placeholder="이름 검색"
              value={assignFilter}
              onChange={(e) => setAssignFilter(e.target.value)}
              className="bg-input border-border shrink-0"
              disabled={pending}
            />
            <div className="overflow-y-auto flex-1 min-h-[12rem] max-h-[50vh] rounded-md border border-border p-3 space-y-2">
              {filteredAssignMembers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">선수가 없거나 검색 결과가 없습니다.</p>
              ) : (
                filteredAssignMembers.map((m) => (
                  <label
                    key={m.id}
                    className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-secondary/50 cursor-pointer"
                  >
                    <Checkbox
                      checked={assignSelected.has(m.id)}
                      onCheckedChange={() => toggleAssignMember(m.id)}
                      disabled={pending}
                    />
                    <span className="text-sm text-foreground">{m.name}</span>
                  </label>
                ))
              )}
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0 shrink-0">
            <Button type="button" variant="outline" className="border-border" onClick={() => setAssignBadge(null)} disabled={pending}>
              취소
            </Button>
            <Button
              type="button"
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={handleSaveAssign}
              disabled={pending}
            >
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 전역 뱃지 삭제 확인 */}
      <AlertDialog open={!!deleteBadgeTarget} onOpenChange={(v) => { if (!v) setDeleteBadgeTarget(null) }}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">전역 뱃지 삭제</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground space-y-2">
              <span className="block break-words text-foreground font-medium">{deleteBadgeTarget?.label}</span>
              뱃지와 모든 선수에 대한 부여가 삭제됩니다. 데이터센터에서 더 이상 표시되지 않습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border text-foreground">취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteBadgeConfirm}
              disabled={pending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  )
}

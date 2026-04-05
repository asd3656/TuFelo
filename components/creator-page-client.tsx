"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
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
import { ArrowLeft, Shield, Plus, Trash2, ScrollText, X } from "lucide-react"
import { addAdminAccountAction, deleteAdminAccountAction } from "@/app/actions/creator"
import { logoutAdminAction } from "@/app/actions/admin"

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
}

const ACTION_OPTIONS = [
  "__all__",
  "전적 등록",
  "전적 삭제",
  "클랜원 추가",
  "클랜원 수정",
  "클랜원 탈퇴처리",
  "클랜원 복귀처리",
  "클랜원 완전삭제",
  "관리자 추가",
  "관리자 삭제",
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

export function CreatorPageClient({ currentUsername, admins, logs }: CreatorPageClientProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  // 관리자 추가 폼
  const [newUsername, setNewUsername] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [formErr, setFormErr] = useState<string | null>(null)

  // 계정 삭제 확인
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

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

  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-5xl">

        {/* 헤더 */}
        <header className="mb-10">
          <div className="flex items-center justify-between gap-4 mb-2">
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div className="flex items-center gap-3">
                <Shield className="h-8 w-8 text-red-500" />
                <h1 className="text-3xl font-bold text-foreground">제작자 페이지</h1>
              </div>
            </div>
            <Button
              variant="outline"
              className="border-border text-muted-foreground hover:text-foreground"
              onClick={handleLogout}
              disabled={pending}
            >
              로그아웃
            </Button>
          </div>
          <p className="text-muted-foreground ml-14">
            로그인 중: <span className="text-foreground font-semibold">{currentUsername}</span>
            <Badge className="ml-2 bg-red-600/20 text-red-400 border-red-500/30">제작자</Badge>
          </p>
        </header>

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
                        <Badge className="bg-red-600/20 text-red-400 border-red-500/30">제작자</Badge>
                      ) : (
                        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">관리자</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center text-muted-foreground text-sm">
                      {formatDate(admin.created_at)}
                    </TableCell>
                    <TableCell className="text-center">
                      {admin.role !== "creator" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setDeleteTarget(admin.username)}
                          disabled={pending}
                          title="삭제"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
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
                />
              </div>
              <Button
                type="submit"
                disabled={pending}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                <Plus className="h-4 w-4 mr-1" />
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
                      <TableCell className="text-xs text-muted-foreground">{log.detail ?? "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      </div>

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
    </main>
  )
}

"use client"

import { useRouter } from "next/navigation"
import { useMemo, useState, useTransition } from "react"
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
import { Plus, Trophy, BarChart3, Users, Megaphone } from "lucide-react"
import { getSeoulDateString } from "@/lib/date-seoul"
import type { ClanMember, Match, RegisterMatchInput, UpdateMatchInput } from "@/lib/types/tufelo"
import { registerMatchAction, deleteMatchAction, updateMatchAction } from "@/app/actions/matches"

export type { Tier, Race, Match } from "@/lib/types/tufelo"

interface DashboardPageProps {
  initialMatches: Match[]
  members: ClanMember[]
  isAdmin: boolean
  isCreator?: boolean
  adminUsernames?: string[]
}

export function DashboardPage({ initialMatches, members, isAdmin, isCreator, adminUsernames = [] }: DashboardPageProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isDeletePending, startDeleteTransition] = useTransition()
  const [isEditPending, startEditTransition] = useTransition()
  const [editingMatch, setEditingMatch] = useState<Match | null>(null)
  const [isNoticeOpen, setIsNoticeOpen] = useState(false)
  const [player1, setPlayer1] = useState("")
  const [player2, setPlayer2] = useState("")
  const [filterDateFrom, setFilterDateFrom] = useState("")
  const [filterDateTo, setFilterDateTo] = useState("")
  const [filterMap, setFilterMap] = useState("")
  const [filterMatchType, setFilterMatchType] = useState("__all__")
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [adminLoginOpen, setAdminLoginOpen] = useState(false)

  const seoulToday = getSeoulDateString()

  const filteredMatches = initialMatches.filter((match) => {
    const matchesPlayer1 =
      !player1 ||
      match.player1.toLowerCase().includes(player1.toLowerCase()) ||
      match.player2.toLowerCase().includes(player1.toLowerCase())
    const matchesPlayer2 =
      !player2 ||
      match.player2.toLowerCase().includes(player2.toLowerCase()) ||
      match.player1.toLowerCase().includes(player2.toLowerCase())
    const matchesDate =
      (!filterDateFrom || match.date >= filterDateFrom) &&
      (!filterDateTo || match.date <= filterDateTo)
    const q = filterMap.trim().toLowerCase()
    const matchesMap = !q || match.map.toLowerCase().includes(q)
    const matchesType = filterMatchType === "__all__" || match.matchType === filterMatchType
    return matchesPlayer1 && matchesPlayer2 && matchesDate && matchesMap && matchesType
  })

  // 선수1 검색 없을 때는 최근 50경기만 표시, 선수1 검색 시 전체 표시
  const displayMatches = player1 ? filteredMatches : filteredMatches.slice(0, 50)

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
      if (!keepOpen) {
        setIsDialogOpen(false)
      }
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

  const memberOptions = members.map((m) => ({ id: m.id, name: m.name }))

  const knownMaps = useMemo(
    () => Array.from(new Set(initialMatches.map((m) => m.map))).sort(),
    [initialMatches],
  )

  const knownMatchTypes = useMemo(
    () =>
      Array.from(new Set(initialMatches.map((m) => m.matchType).filter((t): t is string => !!t))).sort(),
    [initialMatches],
  )

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
                value={player2}
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

          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4 pt-6 border-t border-border">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground">날짜 필터</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={filterDateFrom}
                  max={filterDateTo || seoulToday}
                  onChange={(e) => {
                    const v = e.target.value
                    setFilterDateFrom(!v ? "" : v > seoulToday ? seoulToday : v)
                  }}
                  className="bg-input border-border text-foreground"
                />
                <span className="text-muted-foreground text-sm shrink-0">~</span>
                <Input
                  type="date"
                  value={filterDateTo}
                  min={filterDateFrom || undefined}
                  max={seoulToday}
                  onChange={(e) => {
                    const v = e.target.value
                    setFilterDateTo(!v ? "" : v > seoulToday ? seoulToday : v)
                  }}
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
                onChange={(e) => setFilterMap(e.target.value)}
                className="bg-input border-border text-foreground placeholder:text-muted-foreground"
              />
              <p className="text-xs text-muted-foreground">입력한 글이 포함된 맵 이름의 전적만 표시</p>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground">경기 유형 필터</Label>
              <Select value={filterMatchType} onValueChange={setFilterMatchType}>
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
            <StatCard title="총 경기" value={filteredMatches.length} color="text-foreground" />
            <StatCard
              title="승리"
              value={
                filteredMatches.filter(
                  (m) =>
                    m.winner.toLowerCase() === player1.toLowerCase() ||
                    (m.player1.toLowerCase().includes(player1.toLowerCase()) && m.winner === m.player1) ||
                    (m.player2.toLowerCase().includes(player1.toLowerCase()) && m.winner === m.player2),
                ).length
              }
              color="text-accent"
            />
            <StatCard
              title="패배"
              value={
                filteredMatches.filter(
                  (m) =>
                    (m.player1.toLowerCase().includes(player1.toLowerCase()) && m.winner !== m.player1) ||
                    (m.player2.toLowerCase().includes(player1.toLowerCase()) && m.winner !== m.player2),
                ).length
              }
              color="text-destructive"
            />
          </section>
        )}

        <section className="bg-card rounded-lg border border-border overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">전적 기록</h2>
              <p className="text-sm text-muted-foreground">
                {player1
                  ? `"${player1}" 선수의 경기 기록 (${filteredMatches.length}경기)`
                  : `전체 경기 기록 (최근 50경기 표시 / 전체 ${filteredMatches.length}경기)`}
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
          <MatchHistory
            matches={displayMatches}
            searchPlayer={player1}
            isAdmin={isAdmin}
            onDeleteMatch={handleDeleteMatch}
            deletePending={isDeletePending}
            onEditMatch={(match) => setEditingMatch(match)}
            editPending={isEditPending}
          />
        </section>

        <AdminLoginDialog
          open={adminLoginOpen}
          onOpenChange={setAdminLoginOpen}
          onSuccess={() => router.refresh()}
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

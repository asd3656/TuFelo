"use client"

import { useState, useEffect } from "react"
import type { Match, Race, Tier } from "@/lib/types/tufelo"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Pencil, Trash2, Lock } from "lucide-react"

interface MatchHistoryProps {
  matches: Match[]
  searchPlayer: string
  isAdmin?: boolean
  isGuest?: boolean
  deletePending?: boolean
  onEditMatch?: (match: Match) => void
  editPending?: boolean
  onBulkDelete?: (matchIds: string[]) => void
}

const raceColors: Record<string, string> = {
  T: "bg-blue-100 dark:bg-blue-600/20 text-blue-700 dark:text-blue-400 border-blue-400/60 dark:border-blue-500/30",
  P: "bg-amber-100 dark:bg-amber-600/20 text-amber-700 dark:text-amber-400 border-amber-400/60 dark:border-amber-500/30",
  Z: "bg-red-100 dark:bg-red-600/20 text-red-700 dark:text-red-400 border-red-400/60 dark:border-red-500/30",
}

const raceNames: Record<string, string> = {
  T: "Terran",
  P: "Protoss",
  Z: "Zerg",
}

const tierColors: Record<Tier, string> = {
  1: "bg-yellow-100 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-400/60 dark:border-yellow-500/30",
  2: "bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400 border-purple-400/60 dark:border-purple-500/30",
  3: "bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-400/60 dark:border-blue-500/30",
  4: "bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400 border-green-400/60 dark:border-green-500/30",
}

function TierBadge({ tier }: { tier?: Tier }) {
  if (!tier) {
    return (
      <span className="text-xs text-muted-foreground tabular-nums" aria-hidden>
        —
      </span>
    )
  }
  return (
    <Badge variant="outline" className={`text-xs font-semibold px-1.5 py-0 ${tierColors[tier]}`}>
      {tier}티어
    </Badge>
  )
}

function RaceBadge({ race }: { race?: Race }) {
  if (!race) {
    return (
      <span className="text-xs text-muted-foreground" title="DB 연동 후 표시">
        —
      </span>
    )
  }
  return (
    <Badge variant="outline" className={raceColors[race]}>
      {raceNames[race]}
    </Badge>
  )
}

const winnerMarkClass =
  "shrink-0 text-sm font-black tracking-tight text-emerald-600 dark:text-emerald-400"

const winnerNameClass =
  "font-bold text-emerald-600 dark:text-emerald-400"

const loserNameClass = "text-foreground font-medium"

function formatEloDelta(delta: number | undefined): string {
  if (delta === undefined) return "—"
  if (delta > 0) return `+${delta}`
  return String(delta)
}

export function MatchHistory({
  matches,
  searchPlayer,
  isAdmin = false,
  isGuest = false,
  deletePending = false,
  onEditMatch,
  editPending = false,
  onBulkDelete,
}: MatchHistoryProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // 페이지/필터 변경 시 선택 초기화
  useEffect(() => {
    setSelectedIds(new Set())
  }, [matches])

  if (matches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <p className="text-lg">표시할 전적이 없습니다</p>
        <p className="text-sm">선수·날짜·맵 조건을 확인해 주세요</p>
      </div>
    )
  }

  const isPlayerWinner = (match: Match, playerName: string) => {
    if (!playerName) return false
    const player1Matches = match.player1.toLowerCase().includes(playerName.toLowerCase())
    const player2Matches = match.player2.toLowerCase().includes(playerName.toLowerCase())

    if (player1Matches && match.winner === match.player1) return true
    if (player2Matches && match.winner === match.player2) return true
    return false
  }

  const allSelected = matches.length > 0 && selectedIds.size === matches.length
  const someSelected = selectedIds.size > 0 && selectedIds.size < matches.length

  function toggleAll(checked: boolean | "indeterminate") {
    if (checked === true) setSelectedIds(new Set(matches.map((m) => m.id)))
    else setSelectedIds(new Set())
  }

  function toggleOne(id: string, checked: boolean | "indeterminate") {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked === true) next.add(id)
      else next.delete(id)
      return next
    })
  }

  return (
    <div>
      {/* 일괄 삭제 액션 바 */}
      {isAdmin && selectedIds.size > 0 && (
        <div className="px-4 py-2.5 flex items-center gap-3 bg-destructive/5 dark:bg-destructive/10 border-b border-destructive/20">
          <span className="text-sm font-medium text-destructive">
            {selectedIds.size}개 선택됨
          </span>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            className="h-7 px-3 text-xs bg-red-600 hover:bg-red-700 text-white border-0"
            disabled={deletePending}
            onClick={() => onBulkDelete?.(Array.from(selectedIds))}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            선택 삭제
          </Button>
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors ml-auto"
            onClick={() => setSelectedIds(new Set())}
          >
            선택 해제
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              {(isAdmin || isGuest) && (
                <TableHead className="w-10 text-center">
                  <Checkbox
                    checked={allSelected ? true : someSelected ? "indeterminate" : false}
                    onCheckedChange={toggleAll}
                    disabled={isGuest || deletePending}
                    aria-label="전체 선택"
                    className="border-2 border-slate-400 dark:border-slate-400 data-[state=checked]:border-primary data-[state=indeterminate]:border-primary"
                  />
                </TableHead>
              )}
              <TableHead className="text-muted-foreground font-semibold">날짜</TableHead>
              <TableHead className="text-muted-foreground font-semibold">선수 1</TableHead>
              <TableHead className="text-muted-foreground font-semibold text-center">종족</TableHead>
              <TableHead className="text-muted-foreground font-semibold text-center">결과</TableHead>
              <TableHead className="text-muted-foreground font-semibold text-center">종족</TableHead>
              <TableHead className="text-muted-foreground font-semibold">선수 2</TableHead>
              <TableHead className="text-muted-foreground font-semibold text-right text-xs whitespace-nowrap">
                ELO 변동
                <span className="block font-normal text-[10px] text-muted-foreground/90">(선수1)</span>
              </TableHead>
              <TableHead className="text-muted-foreground font-semibold">맵</TableHead>
              <TableHead className="text-muted-foreground font-semibold whitespace-nowrap">경기 유형</TableHead>
              {(isAdmin || isGuest) && (
                <TableHead className="text-muted-foreground font-semibold w-[60px] text-center">
                  수정
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {matches.map((match) => {
              const player1Won = match.winner === match.player1
              const searchPlayerWon = searchPlayer ? isPlayerWinner(match, searchPlayer) : null
              const delta = match.player1EloDelta
              const deltaClass =
                delta === undefined
                  ? "text-muted-foreground"
                  : delta > 0
                    ? "text-emerald-600 dark:text-emerald-400 font-semibold tabular-nums"
                    : delta < 0
                      ? "text-destructive font-semibold tabular-nums"
                      : "text-muted-foreground tabular-nums"

              const isSelected = selectedIds.has(match.id)

              return (
                <TableRow
                  key={match.id}
                  className={`border-border hover:bg-secondary/50 transition-colors ${isSelected ? "bg-destructive/5 dark:bg-destructive/10" : ""}`}
                >
                  {(isAdmin || isGuest) && (
                    <TableCell className="text-center p-2">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(checked) => toggleOne(match.id, checked)}
                        disabled={isGuest || deletePending}
                        aria-label={`${match.player1} vs ${match.player2} 선택`}
                        className="border-2 border-slate-400 dark:border-slate-400 data-[state=checked]:border-primary"
                      />
                    </TableCell>
                  )}
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDate(match.date)}
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-2 flex-wrap">
                      {player1Won && (
                        <span className={winnerMarkClass} aria-label="승리">
                          [W]
                        </span>
                      )}
                      <span className={player1Won ? winnerNameClass : loserNameClass}>
                        {match.player1}
                      </span>
                      <TierBadge tier={match.player1Tier} />
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <RaceBadge race={match.player1Race} />
                  </TableCell>
                  <TableCell className="text-center">
                    {searchPlayer ? (
                      <Badge
                        className={
                          searchPlayerWon
                            ? "bg-accent/20 text-accent border-accent/30"
                            : "bg-destructive/20 text-destructive border-destructive/30"
                        }
                        variant="outline"
                      >
                        {searchPlayerWon ? "WIN" : "LOSE"}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">vs</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <RaceBadge race={match.player2Race} />
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-2 flex-wrap">
                      {!player1Won && (
                        <span className={winnerMarkClass} aria-label="승리">
                          [W]
                        </span>
                      )}
                      <span className={!player1Won ? winnerNameClass : loserNameClass}>
                        {match.player2}
                      </span>
                      <TierBadge tier={match.player2Tier} />
                    </span>
                  </TableCell>
                  <TableCell className={`text-right text-sm ${deltaClass}`} title="선수1 기준">
                    {formatEloDelta(delta)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{match.map}</TableCell>
                  <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                    {match.matchType ?? "—"}
                  </TableCell>
                  {(isAdmin || isGuest) && (
                    <TableCell className="text-center p-2">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 border-amber-400 dark:border-amber-500/50 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10 hover:text-amber-700 dark:hover:text-amber-300"
                          disabled={isGuest || editPending || deletePending}
                          title={isGuest ? "관리자 권한이 필요합니다" : undefined}
                          onClick={() => onEditMatch?.(match)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {isGuest && <Lock className="h-3.5 w-3.5 text-muted-foreground/50" />}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
}

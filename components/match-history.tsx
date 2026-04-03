"use client"

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
import { Trash2 } from "lucide-react"

interface MatchHistoryProps {
  matches: Match[]
  searchPlayer: string
  isAdmin?: boolean
  onDeleteMatch?: (matchId: string) => void
  deletePending?: boolean
}

const raceColors: Record<string, string> = {
  T: "bg-blue-600/20 text-blue-400 border-blue-500/30",
  P: "bg-amber-600/20 text-amber-400 border-amber-500/30",
  Z: "bg-red-600/20 text-red-400 border-red-500/30",
}

const raceNames: Record<string, string> = {
  T: "Terran",
  P: "Protoss",
  Z: "Zerg",
}

const tierColors: Record<Tier, string> = {
  1: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  2: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  3: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  4: "bg-green-500/20 text-green-400 border-green-500/30",
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
  onDeleteMatch,
  deletePending = false,
}: MatchHistoryProps) {
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

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="border-border hover:bg-transparent">
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
            <TableHead className="text-muted-foreground font-semibold w-[88px] text-center">
              삭제
            </TableHead>
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

            return (
              <TableRow
                key={match.id}
                className="border-border hover:bg-secondary/50 transition-colors"
              >
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
                <TableCell className="text-center p-2">
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="h-8 bg-red-600 hover:bg-red-700 text-white border-0"
                    disabled={deletePending}
                    onClick={() => {
                      if (!isAdmin) {
                        window.alert("운영진에게 문의하세요.")
                        return
                      }
                      if (
                        !window.confirm(
                          "이 전적을 삭제하고 양 선수 ELO·전적을 되돌릴까요?",
                        )
                      ) {
                        return
                      }
                      onDeleteMatch?.(match.id)
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
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

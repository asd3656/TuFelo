"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { getSeoulDateString } from "@/lib/date-seoul"
import type { Match, UpdateMatchInput } from "@/lib/types/tufelo"
import { cn } from "@/lib/utils"

interface EditMatchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  match: Match | null
  onUpdate: (input: UpdateMatchInput) => void
  isSubmitting?: boolean
  knownMaps: string[]
  knownMatchTypes: string[]
}

const mapNamePattern = /^\S+$/

function clampDateToSeoulMax(value: string): string {
  const max = getSeoulDateString()
  if (!value) return max
  return value > max ? max : value
}

function MapAutocomplete({
  value,
  knownMaps,
  onChange,
  error,
}: {
  value: string
  knownMaps: string[]
  onChange: (v: string) => void
  error: string | null
}) {
  const [openList, setOpenList] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const choices = useMemo(() => {
    const q = value.trim().toLowerCase()
    if (!q) return []
    return knownMaps.filter((m) => m.toLowerCase().includes(q))
  }, [knownMaps, value])

  useEffect(() => { setActiveIndex(-1) }, [choices])

  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      listRef.current.querySelectorAll<HTMLElement>('[role="option"]')[activeIndex]
        ?.scrollIntoView({ block: "nearest" })
    }
  }, [activeIndex])

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpenList(false)
      }
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [])

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!openList || choices.length === 0) {
      if (e.key === "ArrowDown") { setOpenList(true); e.preventDefault() }
      return
    }
    switch (e.key) {
      case "ArrowDown": e.preventDefault(); setActiveIndex((p) => Math.min(p + 1, choices.length - 1)); break
      case "ArrowUp": e.preventDefault(); setActiveIndex((p) => Math.max(p - 1, 0)); break
      case "Enter":
        e.preventDefault()
        if (activeIndex >= 0 && activeIndex < choices.length) {
          onChange(choices[activeIndex]); setOpenList(false)
        }
        break
      case "Escape": setOpenList(false); setActiveIndex(-1); break
      case "Tab": setOpenList(false); break
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <Input
        ref={inputRef}
        placeholder="예: 서킷브레이커"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpenList(true) }}
        onFocus={() => { if (value.trim()) setOpenList(true) }}
        onKeyDown={handleKeyDown}
        autoComplete="off"
        className="bg-input border-border"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={openList && choices.length > 0}
      />
      {openList && choices.length > 0 && (
        <ul
          ref={listRef}
          className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border border-border bg-popover py-1 text-popover-foreground shadow-md"
          role="listbox"
        >
          {choices.map((mapName, idx) => (
            <li key={mapName} role="option" aria-selected={idx === activeIndex}>
              <button
                type="button"
                className={cn(
                  "w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground",
                  idx === activeIndex && "bg-accent/50",
                )}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onChange(mapName); setOpenList(false); inputRef.current?.focus() }}
              >
                {mapName}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-sm text-destructive mt-1">{error}</p>}
    </div>
  )
}

function MatchTypeAutocomplete({
  value,
  knownTypes,
  onChange,
}: {
  value: string
  knownTypes: readonly string[]
  onChange: (v: string) => void
}) {
  const [openList, setOpenList] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const choices = useMemo(() => {
    const q = value.trim().toLowerCase()
    if (!q) return [...knownTypes]
    return knownTypes.filter((t) => t.toLowerCase().includes(q))
  }, [knownTypes, value])

  useEffect(() => { setActiveIndex(-1) }, [choices])

  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      listRef.current.querySelectorAll<HTMLElement>('[role="option"]')[activeIndex]
        ?.scrollIntoView({ block: "nearest" })
    }
  }, [activeIndex])

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpenList(false)
      }
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [])

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!openList || choices.length === 0) {
      if (e.key === "ArrowDown") { setOpenList(true); e.preventDefault() }
      return
    }
    switch (e.key) {
      case "ArrowDown": e.preventDefault(); setActiveIndex((p) => Math.min(p + 1, choices.length - 1)); break
      case "ArrowUp": e.preventDefault(); setActiveIndex((p) => Math.max(p - 1, 0)); break
      case "Enter":
        e.preventDefault()
        if (activeIndex >= 0 && activeIndex < choices.length) {
          onChange(choices[activeIndex]); setOpenList(false)
        }
        break
      case "Escape": setOpenList(false); setActiveIndex(-1); break
      case "Tab": setOpenList(false); break
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <Input
        ref={inputRef}
        placeholder="예: 친선"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpenList(true) }}
        onFocus={() => setOpenList(true)}
        onKeyDown={handleKeyDown}
        autoComplete="off"
        className="bg-input border-border"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={openList && choices.length > 0}
      />
      {openList && choices.length > 0 && (
        <ul
          ref={listRef}
          className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border border-border bg-popover py-1 text-popover-foreground shadow-md"
          role="listbox"
        >
          {choices.map((typeName, idx) => (
            <li key={typeName} role="option" aria-selected={idx === activeIndex}>
              <button
                type="button"
                className={cn(
                  "w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground",
                  idx === activeIndex && "bg-accent/50",
                )}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onChange(typeName); setOpenList(false); inputRef.current?.focus() }}
              >
                {typeName}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function EditMatchDialog({
  open,
  onOpenChange,
  match,
  onUpdate,
  isSubmitting = false,
  knownMaps,
  knownMatchTypes,
}: EditMatchDialogProps) {
  const [isPlayer1Winner, setIsPlayer1Winner] = useState(true)
  const [map, setMap] = useState("")
  const [date, setDate] = useState(getSeoulDateString())
  const [matchType, setMatchType] = useState("")
  const [mapError, setMapError] = useState<string | null>(null)

  const seoulToday = getSeoulDateString()

  useEffect(() => {
    if (!open || !match) return
    setMapError(null)
    setIsPlayer1Winner(match.winner === match.player1)
    setMap(match.map)
    setDate(match.date)
    setMatchType(match.matchType ?? "")
  }, [open, match])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!match) return
    setMapError(null)
    if (!map) { window.alert("맵 이름을 입력해 주세요."); return }
    if (!mapNamePattern.test(map)) {
      setMapError("맵 이름은 띄어쓰기 없이 입력해 주세요.")
      return
    }
    if (!matchType.trim()) { window.alert("경기 유형을 입력해 주세요."); return }

    onUpdate({
      matchId: match.id,
      isPlayer1Winner,
      mapName: map,
      playedDate: clampDateToSeoulMax(date),
      matchType,
    })
  }

  if (!match) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border text-foreground max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">전적 수정</DialogTitle>
          <p className="text-sm text-muted-foreground font-normal pt-1">
            선수는 변경할 수 없습니다. 승자·맵·날짜·경기 유형을 수정하면 ELO가 자동으로 재계산됩니다.
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 선수 표시 (고정) */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">승자 선택</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setIsPlayer1Winner(true)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg border-2 px-3 py-3 text-sm font-semibold transition-colors",
                  isPlayer1Winner
                    ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                    : "border-border bg-transparent text-muted-foreground hover:border-border/80 hover:bg-secondary/50",
                )}
              >
                <span className="text-xs text-muted-foreground font-normal">선수 1</span>
                <span className="text-base font-bold">{match.player1}</span>
                {isPlayer1Winner && (
                  <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs px-1.5 py-0">
                    WIN
                  </Badge>
                )}
              </button>

              <button
                type="button"
                onClick={() => setIsPlayer1Winner(false)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg border-2 px-3 py-3 text-sm font-semibold transition-colors",
                  !isPlayer1Winner
                    ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                    : "border-border bg-transparent text-muted-foreground hover:border-border/80 hover:bg-secondary/50",
                )}
              >
                <span className="text-xs text-muted-foreground font-normal">선수 2</span>
                <span className="text-base font-bold">{match.player2}</span>
                {!isPlayer1Winner && (
                  <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs px-1.5 py-0">
                    WIN
                  </Badge>
                )}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-sm font-medium text-muted-foreground">맵</label>
              <span className="text-xs text-muted-foreground">띄어쓰기 없이 풀네임 한글로만</span>
            </div>
            <MapAutocomplete
              value={map}
              knownMaps={knownMaps}
              onChange={(v) => { setMapError(null); setMap(v) }}
              error={mapError}
            />
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-sm font-medium text-muted-foreground">경기 유형</label>
              <span className="text-xs text-muted-foreground">같은 경기유형 양식을 통일해주세요.</span>
            </div>
            <MatchTypeAutocomplete
              value={matchType}
              knownTypes={knownMatchTypes}
              onChange={setMatchType}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">날짜</label>
            <Input
              type="date"
              value={date}
              max={seoulToday}
              onChange={(e) => {
                const v = e.target.value
                setDate(v ? clampDateToSeoulMax(v) : seoulToday)
              }}
              className="bg-input border-border"
            />
            <p className="text-xs text-muted-foreground">서울 기준 오늘까지만 선택할 수 있습니다</p>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1 border-border"
              disabled={isSubmitting}
            >
              취소
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground"
              disabled={isSubmitting}
            >
              {isSubmitting ? "저장 중…" : "저장"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

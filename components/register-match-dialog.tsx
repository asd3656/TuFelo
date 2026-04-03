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
import { getSeoulDateString } from "@/lib/date-seoul"
import type { RegisterMatchInput } from "@/lib/types/tufelo"
import { cn } from "@/lib/utils"

interface RegisterMatchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  members: { id: string; name: string }[]
  onRegister: (input: RegisterMatchInput) => void
  isSubmitting?: boolean
  prefillDate: string
  prefillMap: string
}

const mapNamePattern = /^[가-힣]+$/

function clampDateToSeoulMax(value: string): string {
  const max = getSeoulDateString()
  if (!value) return max
  return value > max ? max : value
}

function filterMembersByPrefix(query: string, members: { id: string; name: string }[]) {
  const q = query.trim().toLowerCase()
  if (!q) return []
  return members.filter((m) => m.name.toLowerCase().startsWith(q))
}

function MemberAutocomplete({
  label,
  placeholder,
  members,
  excludeId,
  valueText,
  selectedId,
  onChange,
}: {
  label: string
  placeholder: string
  members: { id: string; name: string }[]
  excludeId: string
  valueText: string
  selectedId: string
  onChange: (id: string, name: string) => void
}) {
  const [openList, setOpenList] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const choices = useMemo(() => {
    const pool = excludeId ? members.filter((m) => m.id !== excludeId) : members
    return filterMembersByPrefix(valueText, pool)
  }, [members, valueText, excludeId])

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpenList(false)
      }
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [])

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-muted-foreground">{label}</label>
      <div ref={wrapRef} className="relative">
        <Input
          ref={inputRef}
          placeholder={placeholder}
          value={valueText}
          onChange={(e) => {
            const v = e.target.value
            onChange("", v)
            setOpenList(true)
          }}
          onFocus={() => setOpenList(true)}
          autoComplete="off"
          className="bg-input border-border"
        />
        {openList && choices.length > 0 && (
          <ul
            className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border border-border bg-popover py-1 text-popover-foreground shadow-md"
            role="listbox"
          >
            {choices.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  className={cn(
                    "w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground",
                    selectedId === m.id && "bg-accent/50",
                  )}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(m.id, m.name)
                    setOpenList(false)
                    inputRef.current?.blur()
                  }}
                >
                  {m.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export function RegisterMatchDialog({
  open,
  onOpenChange,
  members,
  onRegister,
  isSubmitting,
  prefillDate,
  prefillMap,
}: RegisterMatchDialogProps) {
  const [p1Id, setP1Id] = useState("")
  const [p1Text, setP1Text] = useState("")
  const [p2Id, setP2Id] = useState("")
  const [p2Text, setP2Text] = useState("")
  const [map, setMap] = useState("")
  const [date, setDate] = useState(getSeoulDateString())
  const [mapError, setMapError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setMapError(null)
    setDate(prefillDate ? clampDateToSeoulMax(prefillDate) : getSeoulDateString())
    setMap(prefillMap)
    setP1Id("")
    setP1Text("")
    setP2Id("")
    setP2Text("")
  }, [open, prefillDate, prefillMap])

  useEffect(() => {
    if (p2Id && p1Id && p2Id === p1Id) {
      setP2Id("")
      setP2Text("")
    }
  }, [p1Id, p2Id])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setMapError(null)
    if (!p1Id || !p2Id || !map) {
      if (!p1Id) window.alert("선수 1을 목록에서 선택해 주세요. (이름 입력 후 제안 클릭)")
      else if (!p2Id) window.alert("선수 2를 목록에서 선택해 주세요.")
      return
    }
    if (!mapNamePattern.test(map)) {
      setMapError("맵 이름은 띄어쓰기 없이 한글만 입력해 주세요.")
      return
    }
    onRegister({
      player1Id: p1Id,
      player2Id: p2Id,
      mapName: map,
      playedDate: clampDateToSeoulMax(date),
    })
  }

  const seoulToday = getSeoulDateString()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border text-foreground max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">새 전적 등록</DialogTitle>
          <p className="text-sm text-muted-foreground font-normal pt-1">
            선수 이름을 입력하면 같은 글자로 시작하는 클랜원이 표시됩니다. (대소문자 무시) 선수 1이 승자로
            기록됩니다.
          </p>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <MemberAutocomplete
            label="선수 1 (승자)"
            placeholder="이름 입력…"
            members={members}
            excludeId=""
            valueText={p1Text}
            selectedId={p1Id}
            onChange={(id, name) => {
              setP1Id(id)
              setP1Text(name)
            }}
          />

          <MemberAutocomplete
            label="선수 2"
            placeholder="이름 입력…"
            members={members}
            excludeId={p1Id}
            valueText={p2Text}
            selectedId={p2Id}
            onChange={(id, name) => {
              setP2Id(id)
              setP2Text(name)
            }}
          />

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-sm font-medium text-muted-foreground">맵</label>
              <span className="text-xs text-muted-foreground">띄어쓰기 없이 한글로만</span>
            </div>
            <Input
              placeholder="예: 서킷브레이커"
              value={map}
              onChange={(e) => {
                setMapError(null)
                setMap(e.target.value)
              }}
              className="bg-input border-border"
            />
            {mapError && <p className="text-sm text-destructive">{mapError}</p>}
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
              disabled={isSubmitting || members.length < 2}
            >
              {isSubmitting ? "등록 중…" : "등록"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

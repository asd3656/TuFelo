"use client"

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { BookOpen, Coffee, FileSpreadsheet, Megaphone, Plus, Vote, X, type LucideIcon, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { NoticeSuggestionDialog } from "@/components/notice-suggestion-dialog"
import { getSiteNoticeAction } from "@/app/actions/site-notice"
import {
  readSeenSiteNoticeUpdatedAt,
  shouldPulseNoticeCapsule,
  writeSeenSiteNoticeUpdatedAt,
} from "@/lib/site-notice-highlight"
import { cn } from "@/lib/utils"

type FabItemDef =
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

const FAB_ITEMS: FabItemDef[] = [
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
    href: "https://docs.google.com/spreadsheets/d/1kKeA8Y8AmO99qS6v4Xsu_95z6kdKnXL8DXLSLXoCUx8/edit?gid=1549482567#gid=1549482567",
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

function compareFabItemsByLabelWidth(a: FabItemDef, b: FabItemDef) {
  const w = a.label.length - b.label.length
  if (w !== 0) return w
  return a.label.localeCompare(b.label, "ko")
}

const FAB_ITEMS_SORTED_ASC = [...FAB_ITEMS].sort(compareFabItemsByLabelWidth)

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
  comfortable: {
    shell: "min-h-12 py-1.5 pl-1.5",
    iconWrap: "h-11 w-11",
    icon: "h-6 w-6",
    label: "px-3.5 py-1.5 text-[0.9375rem] leading-snug",
  },
} as const

function FloatingFabCapsule({
  item,
  className,
  size = "default",
  shellHighlight,
  onAfterInteract,
  onManual,
  onNotice,
}: {
  item: FabItemDef
  className?: string
  size?: keyof typeof fabCapsuleSizes
  /** 공지 캡슐만: 최근 수정·미확인 시 얇은 테두리 애니메이션 */
  shellHighlight?: boolean
  onAfterInteract?: () => void
  onManual: () => void
  onNotice: () => void
}) {
  const Icon = item.icon
  const s = fabCapsuleSizes[size]
  const iconEl = (
    <span className={cn("flex shrink-0 items-center justify-center rounded-full text-white shadow-sm", s.iconWrap, item.iconRingClass)}>
      <Icon className={cn("shrink-0", s.icon)} aria-hidden />
    </span>
  )
  const labelEl = <span className={cn(fabCapsuleLabelBase, s.label)}>{item.label}</span>
  const shellClass = cn(
    fabCapsuleShellBase,
    s.shell,
    className,
    shellHighlight &&
      item.kind === "notice" &&
      "fab-notice-capsule-highlight relative z-[1] border-indigo-600/55 dark:border-indigo-400/50",
  )

  if (item.kind === "external") {
    return (
      <a href={item.href} target="_blank" rel="noopener noreferrer" className={shellClass} onClick={onAfterInteract}>
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

export function GlobalFloatingShortcuts({ isAdmin, isCreator }: { isAdmin: boolean; isCreator: boolean }) {
  const [isNoticeOpen, setIsNoticeOpen] = useState(false)
  const [noticeUpdatedAt, setNoticeUpdatedAt] = useState<string | null>(null)
  const [seenNoticeUpdatedAt, setSeenNoticeUpdatedAt] = useState<string | null>(null)
  const prevNoticeOpen = useRef(false)

  const pulseNoticeCapsule = useMemo(
    () => shouldPulseNoticeCapsule(noticeUpdatedAt, seenNoticeUpdatedAt),
    [noticeUpdatedAt, seenNoticeUpdatedAt],
  )

  const [isManualOpen, setIsManualOpen] = useState(false)
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

  useEffect(() => {
    setSeenNoticeUpdatedAt(readSeenSiteNoticeUpdatedAt())
  }, [])

  useEffect(() => {
    let cancelled = false
    void getSiteNoticeAction().then((p) => {
      if (!cancelled) setNoticeUpdatedAt(p.updatedAt)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (prevNoticeOpen.current && !isNoticeOpen) {
      void getSiteNoticeAction().then((p) => setNoticeUpdatedAt(p.updatedAt))
    }
    prevNoticeOpen.current = isNoticeOpen
  }, [isNoticeOpen])

  return (
    <>
      {fabLinksOpenMobile && !isMdViewport && (
        <button
          type="button"
          aria-label="바로가기 메뉴 닫기"
          className="fixed inset-0 z-40 bg-background/50 backdrop-blur-[2px] md:hidden"
          onClick={() => setFabLinksOpenMobile(false)}
        />
      )}
      <div
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+3.25rem)] right-4 z-50 flex max-w-[calc(100vw-2rem)] flex-col-reverse items-end gap-3 sm:right-6 md:bottom-6 md:max-w-[calc(100vw-3rem)] md:right-6"
        role="group"
        aria-label="클랜 바로가기"
      >
        <Button
          type="button"
          size="icon"
          aria-expanded={fabLinksOpen}
          aria-controls="global-fab-actions"
          title={
            fabLinksOpen
              ? "닫기"
              : pulseNoticeCapsule
                ? "바로가기 — 새 공지가 있을 수 있습니다"
                : "바로가기"
          }
          className={cn(
            "h-11 w-11 md:h-12 md:w-12 shrink-0 rounded-full shadow-lg",
            "bg-primary hover:bg-primary/90 text-primary-foreground",
            pulseNoticeCapsule
              ? "fab-notice-capsule-highlight relative z-[1] border-2 border-indigo-600/60 dark:border-indigo-400/55"
              : "border-0",
          )}
          onClick={() => (isMdViewport ? setFabLinksOpenDesktop((o) => !o) : setFabLinksOpenMobile((o) => !o))}
        >
          {fabLinksOpen ? <X className="h-5 w-5 md:h-6 md:w-6" /> : <Plus className="h-5 w-5 md:h-6 md:w-6" />}
        </Button>

        <div
          id="global-fab-actions"
          className={cn(
            "flex flex-col-reverse items-end gap-2.5 transition-all duration-200 ease-out md:gap-2",
            fabLinksOpen
              ? "pointer-events-auto max-h-[1000px] translate-y-0 opacity-100"
              : "pointer-events-none max-h-0 translate-y-3 overflow-hidden opacity-0",
          )}
        >
          {[...FAB_ITEMS_SORTED_ASC].reverse().map((item) => (
            <FloatingFabCapsule
              key={item.id}
              item={item}
              size={fabCapsuleSize}
              className="shrink-0"
              shellHighlight={item.id === "notice" && pulseNoticeCapsule}
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
                      ELO 시스템은 스타 래더 시스템과 크게 차이가 없습니다. <span className="text-foreground font-semibold">최대 상승폭은 32점</span>입니다.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-emerald-400 shrink-0 mt-0.5">•</span>
                    <span>
                      ELO와 승패는 매 시즌 시작과 동시에 <span className="text-foreground font-semibold">초기화</span>되지만 기록이 남습니다.
                      시즌은 프로리그의 시작과 동시에 갱신됩니다.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-emerald-400 shrink-0 mt-0.5">•</span>
                    <span>
                      ELO 초기값은 <span className="text-foreground font-semibold">1티어 2250, 2티어 2030, 3티어 1850, 4티어 1650</span>입니다.
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
        isCreator={isCreator}
        onSiteNoticeSynced={({ updatedAt }) => {
          setNoticeUpdatedAt(updatedAt)
          if (isNoticeOpen && updatedAt) {
            writeSeenSiteNoticeUpdatedAt(updatedAt)
            setSeenNoticeUpdatedAt(updatedAt)
          }
        }}
      />
    </>
  )
}

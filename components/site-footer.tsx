"use client"

import { useEffect, useState } from "react"
import { Users } from "lucide-react"
import { incrementVisitorAction, getVisitorCountAction } from "@/app/actions/visitors"

const COOKIE_KEY = "tuf_visited"

function getTodaySeoul() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" })
}

function getVisitedCookieDate(): string | null {
  const match = document.cookie.split(";").map((c) => c.trim()).find((c) => c.startsWith(`${COOKIE_KEY}=`))
  return match ? match.split("=")[1] : null
}

export function SiteFooter() {
  const currentYear = new Date().getFullYear()
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    const today = getTodaySeoul()
    if (getVisitedCookieDate() === today) {
      getVisitorCountAction().then(setCount)
    } else {
      incrementVisitorAction().then(setCount)
      document.cookie = `${COOKIE_KEY}=${today}; max-age=86400; path=/; SameSite=Lax`
    }
  }, [])

  return (
    <footer className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/80 backdrop-blur">
      <div className="container mx-auto flex h-11 max-w-6xl items-center justify-between px-4">
        <span className="text-xs text-muted-foreground/90">
          © {currentYear} Dae-young Kang (Tyr). All rights reserved.
        </span>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground/70">
          <Users className="h-3.5 w-3.5" />
          <span>
            오늘 방문자{" "}
            {count === null ? (
              <span className="inline-block w-5 h-2.5 bg-muted-foreground/20 rounded animate-pulse align-middle" />
            ) : (
              <span className="font-semibold text-muted-foreground/90">{count.toLocaleString()}</span>
            )}
            명
          </span>
        </div>
        <span className="text-xs text-muted-foreground/90">스타크래프트 TuF CLAN</span>
      </div>
    </footer>
  )
}

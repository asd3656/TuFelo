"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { BarChart3, Database, Monitor, Moon, Sun, Trophy, Users } from "lucide-react"
import { useTheme } from "@teispace/next-themes"

import { AdminLoginDialog } from "@/components/admin-login-dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface SiteHeaderProps {
  isAdmin: boolean
  isCreator?: boolean
  isGuest?: boolean
  loggedInUsername?: string
  adminUsernames?: string[]
}

function navButtonClass(active: boolean, palette: "violet" | "sky" | "red" | "emerald") {
  const paletteClass =
    palette === "violet"
      ? "hover:bg-violet-600 hover:text-white hover:border-violet-600"
      : palette === "sky"
        ? "hover:bg-sky-600 hover:text-white hover:border-sky-600"
        : palette === "red"
          ? "hover:bg-red-600 hover:text-white hover:border-red-600"
          : "hover:bg-emerald-600 hover:text-white hover:border-emerald-600"

  const activeClass =
    palette === "violet"
      ? "bg-violet-600 text-white border-violet-600"
      : palette === "sky"
        ? "bg-sky-600 text-white border-sky-600"
        : palette === "red"
          ? "bg-red-600 text-white border-red-600"
          : "bg-emerald-600 text-white border-emerald-600"

  return cn(
    "h-8 border border-border px-2.5 text-xs bg-background text-foreground shadow-sm transition-colors sm:h-9 sm:px-3 sm:text-sm",
    active ? activeClass : paletteClass,
  )
}

export function SiteHeader({
  isAdmin,
  isCreator,
  isGuest,
  loggedInUsername,
  adminUsernames = [],
}: SiteHeaderProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { theme, setTheme } = useTheme()

  const [mounted, setMounted] = useState(false)
  const [adminLoginOpen, setAdminLoginOpen] = useState(false)

  useEffect(() => setMounted(true), [])

  const isRanking = pathname === "/ranking"
  const isDataCenter = pathname === "/data-center"
  const isCreatorPage = pathname === "/creator"
  const isAdminPage = pathname === "/admin"

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
        <div className="container mx-auto max-w-6xl px-4 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <Link href="/" className="inline-flex w-fit items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                <Trophy className="h-7 w-7 text-primary" />
                <h1 className="text-2xl font-bold text-foreground sm:text-3xl">TuF Clan ELO board</h1>
              </Link>
              {adminUsernames.length > 0 && (
                <p className="mt-2 w-fit text-sm text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-300 dark:border-indigo-500/25 rounded-md px-2.5 py-1 font-medium">
                  관리자 : {adminUsernames.join(", ")}
                </p>
              )}
            </div>

            <div className="w-full overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden sm:w-auto">
              <div className="flex min-w-max items-center justify-start gap-1 pr-1 sm:justify-end sm:gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => {
                  if (theme === "system") setTheme("light")
                  else if (theme === "light") setTheme("dark")
                  else setTheme("system")
                }}
                className="border-border text-foreground hover:bg-secondary shrink-0"
                suppressHydrationWarning
                title={
                  !mounted ? undefined
                    : theme === "system" ? "시스템 설정 (클릭: 라이트 모드)"
                      : theme === "light" ? "라이트 모드 (클릭: 다크 모드)"
                        : "다크 모드 (클릭: 시스템 설정)"
                }
              >
                {!mounted ? <Monitor className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  : theme === "light" ? <Sun className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    : theme === "dark" ? <Moon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      : <Monitor className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
              </Button>

              {(isCreator || isGuest) && (
                <Link href="/creator">
                  <Button className={cn("font-semibold shrink-0", navButtonClass(isCreatorPage, "red"))}>
                    제작자 페이지
                  </Button>
                </Link>
              )}

              <Button
                type="button"
                className="h-8 shrink-0 border border-border bg-background px-2.5 text-xs font-semibold text-foreground shadow-sm transition-colors hover:border-amber-600 hover:bg-amber-600 hover:text-white dark:hover:text-white sm:h-9 sm:px-3 sm:text-sm"
                onClick={() => setAdminLoginOpen(true)}
              >
                {loggedInUsername ? "계정 관리" : "관리자 로그인"}
              </Button>

              {(isAdmin || isGuest) && (
                <Link href="/admin">
                  <Button
                    className={cn("font-semibold shrink-0", navButtonClass(isAdminPage, "emerald"))}
                  >
                    <Users className="mr-1.5 h-3.5 w-3.5 sm:mr-2 sm:h-4 sm:w-4" />
                    클랜원 명단
                  </Button>
                </Link>
              )}

              <Link href="/ranking">
                <Button className={cn("font-semibold shadow-sm border shrink-0", navButtonClass(isRanking, "violet"))}>
                  <BarChart3 className="mr-1.5 h-3.5 w-3.5 sm:mr-2 sm:h-4 sm:w-4" />
                  ELO 랭킹
                </Button>
              </Link>

              <Link href="/data-center">
                <Button className={cn("font-semibold shadow-sm border shrink-0", navButtonClass(isDataCenter, "sky"))}>
                  <Database className="mr-1.5 h-3.5 w-3.5 sm:mr-2 sm:h-4 sm:w-4" />
                  데이터센터
                </Button>
              </Link>
              </div>
            </div>
          </div>
        </div>
      </header>

      <AdminLoginDialog
        open={adminLoginOpen}
        onOpenChange={setAdminLoginOpen}
        onSuccess={() => router.refresh()}
        isLoggedIn={!!loggedInUsername}
        loggedInUsername={loggedInUsername}
      />
    </>
  )
}

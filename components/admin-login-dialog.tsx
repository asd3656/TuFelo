"use client"

import { useState, useTransition } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LogOut, User } from "lucide-react"
import { loginAdminAction, logoutAdminAction, changePasswordAction } from "@/app/actions/admin"
import { cn } from "@/lib/utils"

interface AdminLoginDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  isLoggedIn?: boolean
  loggedInUsername?: string
}

export function AdminLoginDialog({ open, onOpenChange, onSuccess, isLoggedIn, loggedInUsername }: AdminLoginDialogProps) {
  const [pending, startTransition] = useTransition()

  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [loginErr, setLoginErr] = useState<string | null>(null)

  const [cpCurrent, setCpCurrent] = useState("")
  const [cpNew, setCpNew] = useState("")
  const [cpConfirm, setCpConfirm] = useState("")
  const [cpErr, setCpErr] = useState<string | null>(null)
  const [cpSuccess, setCpSuccess] = useState(false)
  const [showPasswordChange, setShowPasswordChange] = useState(false)

  function resetAll() {
    setUsername("")
    setPassword("")
    setLoginErr(null)
    setCpCurrent("")
    setCpNew("")
    setCpConfirm("")
    setCpErr(null)
    setCpSuccess(false)
    setShowPasswordChange(false)
  }

  function handleLogout() {
    startTransition(async () => {
      await logoutAdminAction()
      onOpenChange(false)
      onSuccess()
    })
  }

  function handleLogin(e?: React.FormEvent) {
    e?.preventDefault()
    setLoginErr(null)
    startTransition(async () => {
      const res = await loginAdminAction(username, password)
      if (!res.ok) {
        setLoginErr(res.error)
        return
      }
      resetAll()
      onOpenChange(false)
      onSuccess()
    })
  }

  function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    setCpErr(null)
    setCpSuccess(false)
    const uname = loggedInUsername?.trim() ?? ""
    if (!uname) {
      setCpErr("로그인 정보를 확인할 수 없습니다.")
      return
    }
    if (cpNew !== cpConfirm) {
      setCpErr("새 비밀번호가 일치하지 않습니다.")
      return
    }
    startTransition(async () => {
      const res = await changePasswordAction(uname, cpCurrent, cpNew)
      if (!res.ok) {
        setCpErr(res.error)
        return
      }
      setCpSuccess(true)
      setCpCurrent("")
      setCpNew("")
      setCpConfirm("")
      setShowPasswordChange(false)
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) resetAll()
        onOpenChange(v)
      }}
    >
      <DialogContent
        className={cn(
          "bg-card border-border text-foreground",
          isLoggedIn && showPasswordChange ? "max-w-md" : "max-w-sm",
        )}
      >
        <DialogHeader>
          <DialogTitle>{isLoggedIn ? "계정 관리" : "관리자 로그인"}</DialogTitle>
        </DialogHeader>

        {isLoggedIn ? (
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-3 p-3 bg-secondary/50 rounded-lg border border-border">
              <User className="h-5 w-5 text-amber-500 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">현재 로그인</p>
                <p className="text-sm font-semibold text-foreground">{loggedInUsername}</p>
              </div>
            </div>

            {cpSuccess && !showPasswordChange && (
              <p className="text-sm text-green-600 dark:text-green-500">비밀번호가 변경되었습니다.</p>
            )}

            {!showPasswordChange ? (
              <div className="border-t border-border pt-2 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setCpErr(null)
                    setShowPasswordChange(true)
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
                >
                  비밀번호 변경
                </button>
              </div>
            ) : (
              <form onSubmit={handleChangePassword} className="space-y-3 rounded-lg border border-border bg-secondary/20 p-3">
                <p className="text-sm font-medium text-foreground">비밀번호 변경</p>
                <div className="space-y-1.5">
                  <Label className="text-sm text-muted-foreground">현재 비밀번호</Label>
                  <Input
                    type="password"
                    autoComplete="current-password"
                    placeholder="현재 비밀번호"
                    value={cpCurrent}
                    onChange={(e) => setCpCurrent(e.target.value)}
                    className="bg-input border-border"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm text-muted-foreground">새 비밀번호</Label>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    placeholder="새 비밀번호 (4자 이상)"
                    value={cpNew}
                    onChange={(e) => setCpNew(e.target.value)}
                    className="bg-input border-border"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm text-muted-foreground">새 비밀번호 확인</Label>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    placeholder="새 비밀번호 재입력"
                    value={cpConfirm}
                    onChange={(e) => setCpConfirm(e.target.value)}
                    className="bg-input border-border"
                  />
                </div>
                {cpErr && <p className="text-sm text-destructive">{cpErr}</p>}
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowPasswordChange(false)
                      setCpCurrent("")
                      setCpNew("")
                      setCpConfirm("")
                      setCpErr(null)
                    }}
                    disabled={pending}
                  >
                    취소
                  </Button>
                  <Button type="submit" disabled={pending} className="bg-amber-600 hover:bg-amber-700 text-white">
                    {pending ? "변경 중…" : "변경"}
                  </Button>
                </div>
              </form>
            )}

            <div className="flex gap-2 justify-end pt-1">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
                닫기
              </Button>
              <Button
                type="button"
                onClick={handleLogout}
                disabled={pending}
                className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              >
                <LogOut className="h-4 w-4 mr-2" />
                {pending ? "로그아웃 중…" : "로그아웃"}
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleLogin} className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label className="text-sm text-muted-foreground">아이디</Label>
              <Input
                type="text"
                autoComplete="username"
                placeholder="아이디 입력"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="bg-input border-border"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm text-muted-foreground">비밀번호</Label>
              <Input
                type="password"
                autoComplete="current-password"
                placeholder="비밀번호 입력"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-input border-border"
              />
            </div>
            {loginErr && <p className="text-sm text-destructive">{loginErr}</p>}
            <div className="flex gap-2 justify-end pt-1">
              <Button type="button" variant="outline" onClick={() => { resetAll(); onOpenChange(false) }} disabled={pending}>
                취소
              </Button>
              <Button type="submit" disabled={pending} className="bg-amber-600 hover:bg-amber-700 text-white">
                {pending ? "확인 중…" : "로그인"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

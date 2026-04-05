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
import { loginAdminAction, changePasswordAction } from "@/app/actions/admin"

interface AdminLoginDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

type Mode = "login" | "changePassword"

export function AdminLoginDialog({ open, onOpenChange, onSuccess }: AdminLoginDialogProps) {
  const [mode, setMode] = useState<Mode>("login")
  const [pending, startTransition] = useTransition()

  // 로그인 폼 상태
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [loginErr, setLoginErr] = useState<string | null>(null)

  // 비밀번호 변경 폼 상태
  const [cpUsername, setCpUsername] = useState("")
  const [cpCurrent, setCpCurrent] = useState("")
  const [cpNew, setCpNew] = useState("")
  const [cpConfirm, setCpConfirm] = useState("")
  const [cpErr, setCpErr] = useState<string | null>(null)
  const [cpSuccess, setCpSuccess] = useState(false)

  function resetAll() {
    setMode("login")
    setUsername(""); setPassword(""); setLoginErr(null)
    setCpUsername(""); setCpCurrent(""); setCpNew(""); setCpConfirm("")
    setCpErr(null); setCpSuccess(false)
  }

  function handleLogin(e?: React.FormEvent) {
    e?.preventDefault()
    setLoginErr(null)
    startTransition(async () => {
      const res = await loginAdminAction(username, password)
      if (!res.ok) { setLoginErr(res.error); return }
      resetAll()
      onOpenChange(false)
      onSuccess()
    })
  }

  function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    setCpErr(null)
    setCpSuccess(false)
    if (cpNew !== cpConfirm) {
      setCpErr("새 비밀번호가 일치하지 않습니다.")
      return
    }
    startTransition(async () => {
      const res = await changePasswordAction(cpUsername, cpCurrent, cpNew)
      if (!res.ok) { setCpErr(res.error); return }
      setCpSuccess(true)
      setCpCurrent(""); setCpNew(""); setCpConfirm("")
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetAll(); onOpenChange(v) }}>
      <DialogContent className="bg-card border-border text-foreground max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {mode === "login" ? "관리자 로그인" : "비밀번호 변경"}
          </DialogTitle>
        </DialogHeader>

        {mode === "login" ? (
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
            <div className="border-t border-border pt-2 text-center">
              <button
                type="button"
                onClick={() => { setLoginErr(null); setMode("changePassword") }}
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
              >
                비밀번호 변경
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleChangePassword} className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label className="text-sm text-muted-foreground">아이디</Label>
              <Input
                type="text"
                autoComplete="username"
                placeholder="아이디 입력"
                value={cpUsername}
                onChange={(e) => setCpUsername(e.target.value)}
                className="bg-input border-border"
              />
            </div>
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
            {cpSuccess && <p className="text-sm text-green-500">비밀번호가 변경되었습니다!</p>}
            <div className="flex gap-2 justify-end pt-1">
              <Button type="button" variant="outline" onClick={() => setMode("login")} disabled={pending}>
                뒤로
              </Button>
              <Button type="submit" disabled={pending} className="bg-amber-600 hover:bg-amber-700 text-white">
                {pending ? "변경 중…" : "변경"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

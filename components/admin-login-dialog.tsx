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
import { loginAdminAction } from "@/app/actions/admin"

interface AdminLoginDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function AdminLoginDialog({ open, onOpenChange, onSuccess }: AdminLoginDialogProps) {
  const [password, setPassword] = useState("")
  const [err, setErr] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit(e?: React.FormEvent) {
    e?.preventDefault()
    setErr(null)
    startTransition(async () => {
      const res = await loginAdminAction(password)
      if (!res.ok) {
        setErr(res.error)
        return
      }
      setPassword("")
      onOpenChange(false)
      onSuccess()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border text-foreground max-w-sm">
        <DialogHeader>
          <DialogTitle>관리자 로그인</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3 pt-2">
          <Input
            type="password"
            autoComplete="current-password"
            placeholder="암호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="bg-input border-border"
          />
          {err && <p className="text-sm text-destructive">{err}</p>}
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              취소
            </Button>
            <Button
              type="submit"
              disabled={pending}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {pending ? "확인 중…" : "확인"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

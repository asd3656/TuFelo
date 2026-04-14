"use client"

import { useEffect, useState, useTransition } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Megaphone,
  AlertTriangle,
  Trash2,
  Pencil,
  MessageSquareReply,
  Send,
  ChevronDown,
  ChevronUp,
  Loader2,
  Check,
  X,
} from "lucide-react"

import {
  getSuggestionsAction,
  addSuggestionAction,
  addReplyAction,
  updateReplyAction,
  deleteReplyAction,
  deleteSuggestionAction,
  type Suggestion,
  type SuggestionReply,
} from "@/app/actions/suggestions"

const SUGGESTION_CATEGORIES = ["데이터수정", "기능건의", "기타"] as const

interface NoticeSuggestionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  isAdmin: boolean
  isCreator: boolean
}

const CATEGORY_COLORS: Record<string, string> = {
  기능건의: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
  데이터수정: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  기타: "bg-secondary text-secondary-foreground border-border",
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "방금 전"
  if (mins < 60) return `${mins}분 전`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}시간 전`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}일 전`
  return new Date(iso).toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
  })
}

function ReplyItem({
  reply,
  onChanged,
}: {
  reply: SuggestionReply
  onChanged: () => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState(reply.content)
  const [isEditPending, startEditTransition] = useTransition()
  const [isDeletePending, startDeleteTransition] = useTransition()

  function handleSave() {
    const trimmed = editText.trim()
    if (!trimmed || trimmed === reply.content) { setIsEditing(false); return }
    startEditTransition(async () => {
      const res = await updateReplyAction({ replyId: reply.id, content: trimmed })
      if (!res.ok) { window.alert(res.error); return }
      setIsEditing(false)
      onChanged()
    })
  }

  function handleDelete() {
    if (!window.confirm("이 답변을 삭제하시겠습니까?")) return
    startDeleteTransition(async () => {
      const res = await deleteReplyAction(reply.id)
      if (!res.ok) { window.alert(res.error); return }
      onChanged()
    })
  }

  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-indigo-500/10 text-indigo-400 border-indigo-500/30">
          관리자
        </Badge>
        <span className="text-xs font-medium text-foreground">{reply.admin_username}</span>
        <span className="text-[10px] text-muted-foreground">{formatRelativeTime(reply.created_at)}</span>
        {reply.isOwner && !isEditing && (
          <div className="flex items-center gap-0.5 ml-auto">
            <Button
              type="button" variant="ghost" size="icon"
              className="h-5 w-5 text-muted-foreground hover:text-foreground hover:bg-secondary"
              onClick={() => { setIsEditing(true); setEditText(reply.content) }}
              disabled={isDeletePending}
              title="수정"
            >
              <Pencil className="h-3 w-3" />
            </Button>
            <Button
              type="button" variant="ghost" size="icon"
              className="h-5 w-5 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              onClick={handleDelete}
              disabled={isDeletePending}
              title="삭제"
            >
              {isDeletePending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
            </Button>
          </div>
        )}
      </div>
      {isEditing ? (
        <div className="flex gap-1.5 pl-0.5">
          <Input
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSave() }
              if (e.key === "Escape") { setIsEditing(false); setEditText(reply.content) }
            }}
            className="h-7 text-xs bg-input border-border flex-1"
            disabled={isEditPending}
            autoFocus
            maxLength={300}
          />
          <Button
            type="button" size="icon"
            className="h-7 w-7 shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white border-0"
            onClick={handleSave}
            disabled={isEditPending || !editText.trim()}
            title="저장"
          >
            {isEditPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          </Button>
          <Button
            type="button" variant="ghost" size="icon"
            className="h-7 w-7 shrink-0 text-muted-foreground"
            onClick={() => { setIsEditing(false); setEditText(reply.content) }}
            disabled={isEditPending}
            title="취소"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap break-words pl-0.5">
          {reply.content}
        </p>
      )}
    </div>
  )
}

function SuggestionItem({
  suggestion,
  isAdmin,
  isCreator,
  onDelete,
  onReplyAdded,
}: {
  suggestion: Suggestion
  isAdmin: boolean
  isCreator: boolean
  onDelete: (id: string) => void
  onReplyAdded: () => void
}) {
  const [showReplyInput, setShowReplyInput] = useState(false)
  const [replyText, setReplyText] = useState("")
  const [isReplyPending, startReplyTransition] = useTransition()
  const [showReplies, setShowReplies] = useState(true)

  function handleReply() {
    if (!replyText.trim()) return
    startReplyTransition(async () => {
      const res = await addReplyAction({
        suggestionId: suggestion.id,
        content: replyText,
      })
      if (!res.ok) {
        window.alert(res.error)
        return
      }
      setReplyText("")
      setShowReplyInput(false)
      onReplyAdded()
    })
  }

  const canDelete = isAdmin || isCreator

  return (
    <div className="rounded-lg border border-border bg-card/50 p-4 space-y-3">
      {/* 헤더 */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <Badge variant="outline" className={`text-xs shrink-0 ${CATEGORY_COLORS[suggestion.category] ?? CATEGORY_COLORS["기타"]}`}>
            {suggestion.category}
          </Badge>
          <span className="text-sm font-semibold text-foreground truncate">{suggestion.nickname}</span>
          <span className="text-xs text-muted-foreground shrink-0">{formatRelativeTime(suggestion.created_at)}</span>
        </div>
        {canDelete && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={() => onDelete(suggestion.id)}
            title="삭제"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* 내용 */}
      <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap break-words">
        {suggestion.content}
      </p>

      {/* 답변 목록 */}
      {suggestion.replies.length > 0 && (
        <div className="space-y-2">
          <button
            type="button"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setShowReplies((v) => !v)}
          >
            {showReplies ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            답변 {suggestion.replies.length}개
          </button>
          {showReplies && (
            <div className="space-y-2 pl-3 border-l-2 border-indigo-500/30">
              {suggestion.replies.map((reply) => (
                <ReplyItem key={reply.id} reply={reply} onChanged={onReplyAdded} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* 답변 입력 (관리자만) */}
      {isAdmin && (
        <div className="space-y-2">
          {!showReplyInput ? (
            <button
              type="button"
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-indigo-400 transition-colors"
              onClick={() => setShowReplyInput(true)}
            >
              <MessageSquareReply className="h-3.5 w-3.5" />
              답변 달기
            </button>
          ) : (
            <div className="flex gap-2">
              <Input
                placeholder="답변 내용..."
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleReply() }
                  if (e.key === "Escape") { setShowReplyInput(false); setReplyText("") }
                }}
                className="h-8 text-xs bg-input border-border"
                disabled={isReplyPending}
                autoFocus
              />
              <Button
                type="button"
                size="sm"
                className="h-8 px-3 bg-indigo-600 hover:bg-indigo-700 text-white border-0 shrink-0"
                onClick={handleReply}
                disabled={isReplyPending || !replyText.trim()}
              >
                {isReplyPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-muted-foreground"
                onClick={() => { setShowReplyInput(false); setReplyText("") }}
                disabled={isReplyPending}
              >
                취소
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function NoticeSuggestionDialog({
  open,
  onOpenChange,
  isAdmin,
  isCreator,
}: NoticeSuggestionDialogProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const [category, setCategory] = useState<string>("데이터수정")
  const [content, setContent] = useState("")
  const [nickname, setNickname] = useState("")
  const [isSubmitPending, startSubmitTransition] = useTransition()
  const [isDeletePending, startDeleteTransition] = useTransition()

  async function loadSuggestions() {
    setIsLoading(true)
    try {
      const data = await getSuggestionsAction()
      setSuggestions(data)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (open) loadSuggestions()
  }, [open])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    startSubmitTransition(async () => {
      const res = await addSuggestionAction({ category, content, nickname })
      if (!res.ok) {
        window.alert(res.error)
        return
      }
      setContent("")
      await loadSuggestions()
    })
  }

  function handleDelete(suggestionId: string) {
    const target = suggestions.find((s) => s.id === suggestionId)
    if (!target) return

    if (target.category === "기능건의" && !isCreator) {
      window.alert("제작자만 삭제할 수 있습니다.")
      return
    }

    if (!window.confirm("이 건의사항을 삭제하시겠습니까?")) return

    startDeleteTransition(async () => {
      const res = await deleteSuggestionAction(suggestionId)
      if (!res.ok) {
        window.alert(res.error)
        return
      }
      await loadSuggestions()
    })
  }

  const contentLength = content.length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border text-foreground max-w-2xl w-full max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 shrink-0 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <Megaphone className="h-5 w-5 text-indigo-400" />
            공지 및 건의
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="px-6 py-5 space-y-5">
            {/* ── 공지사항 ── */}
            <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-indigo-400 shrink-0" />
                <p className="text-sm font-bold text-indigo-300">공지사항(26.04.14)</p>
              </div>
              <ul className="space-y-2 text-sm text-muted-foreground leading-relaxed">
                <li className="flex gap-2">
                  <span className="text-indigo-400 shrink-0 mt-0.5">•</span>
                  <span>
                    건의 사항에는{" "}
                    <span className="text-foreground font-semibold">사담 금지</span>입니다.{" "}
                    장난성 글 작성 시{" "}
                    <span className="text-destructive font-semibold">IP 밴</span>입니다.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="text-indigo-400 shrink-0 mt-0.5">•</span>
                  <span>
                    필요이상으로 사이트가 무거워지길 원치 않기에 모든 건의사항들을 반영할 수 없습니다. 데이터 수정 같은 경우{" "}
                    <span className="text-foreground font-semibold">최대한 빠르게 반영</span>하겠습니다.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="text-indigo-400 shrink-0 mt-0.5">•</span>
                  <span>
                    모든 건의사항들은{" "}
                    <span className="text-foreground font-semibold">해결 완료 또는 반영불가 시 삭제</span>됩니다.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="text-indigo-400 shrink-0 mt-0.5">•</span>
                  <span>
                    ELO 랭킹페이지에 4월 초 데이터가 누락되는 이슈가 있었습니다. 4/14 기준 고쳤으니 
                    elo 랭킹페이지와 현재시즌 경기 수가 안맞는 분들은 건의 게시판에 써주세요.
                  </span>
                </li>
              </ul>
            </div>

            {/* ── 구분선 ── */}
            <div className="relative flex items-center gap-3">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground font-medium shrink-0">건의사항</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            {/* ── 건의사항 입력 폼 ── */}
            <form onSubmit={handleSubmit} className="space-y-2">
              <div className="flex gap-2 flex-wrap sm:flex-nowrap">
                {/* 카테고리 */}
                <div className="shrink-0 w-full sm:w-auto">
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger className="bg-input border-border text-foreground h-9 w-full sm:w-32 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SUGGESTION_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* 내용 */}
                <div className="flex-1 min-w-0">
                  <Input
                    placeholder="건의 내용을 입력해 주세요..."
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    maxLength={300}
                    className="bg-input border-border text-foreground h-9 text-sm"
                    disabled={isSubmitPending}
                  />
                </div>

                {/* 닉네임 */}
                <div className="shrink-0 w-full sm:w-28">
                  <Input
                    placeholder="닉네임"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    maxLength={20}
                    className="bg-input border-border text-foreground h-9 text-sm"
                    disabled={isSubmitPending}
                  />
                </div>

                {/* 등록 버튼 */}
                <Button
                  type="submit"
                  className="shrink-0 h-9 px-4 bg-indigo-600 hover:bg-indigo-700 text-white border-0 font-semibold text-sm"
                  disabled={isSubmitPending || !content.trim() || !nickname.trim()}
                >
                  {isSubmitPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "등록"
                  )}
                </Button>
              </div>
              {contentLength > 0 && (
                <p className="text-xs text-muted-foreground text-right">{contentLength} / 300</p>
              )}
            </form>

            {/* ── 건의사항 목록 ── */}
            <div className="space-y-3">
              {isLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : suggestions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                  <Megaphone className="h-10 w-10 mb-3 opacity-30" />
                  <p className="text-sm">아직 건의사항이 없습니다.</p>
                  <p className="text-xs mt-1">위 양식으로 첫 번째 건의사항을 남겨주세요!</p>
                </div>
              ) : (
                suggestions.map((s) => (
                  <SuggestionItem
                    key={s.id}
                    suggestion={s}
                    isAdmin={isAdmin}
                    isCreator={isCreator}
                    onDelete={handleDelete}
                    onReplyAdded={loadSuggestions}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

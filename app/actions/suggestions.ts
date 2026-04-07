"use server"

import { createServiceClient } from "@/lib/supabase/service"
import { getSessionFromCookies } from "@/lib/auth/admin"
import { getClientIp } from "@/lib/request-ip"
import { insertAdminLog } from "@/lib/admin-log"

export type ActionResult = { ok: true } | { ok: false; error: string }

export interface SuggestionReply {
  id: string
  suggestion_id: string
  admin_username: string
  content: string
  created_at: string
  isOwner: boolean
}

export interface Suggestion {
  id: string
  category: string
  content: string
  nickname: string
  created_at: string
  replies: SuggestionReply[]
}

export async function getSuggestionsAction(): Promise<Suggestion[]> {
  const supabase = createServiceClient()
  const session = await getSessionFromCookies()

  const [{ data: suggestions }, { data: replies }] = await Promise.all([
    supabase
      .from("suggestions")
      .select("id, category, content, nickname, created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("suggestion_replies")
      .select("id, suggestion_id, admin_username, content, created_at")
      .order("created_at", { ascending: true }),
  ])

  if (!suggestions) return []

  return suggestions.map((s) => ({
    id: s.id as string,
    category: s.category as string,
    content: s.content as string,
    nickname: s.nickname as string,
    created_at: s.created_at as string,
    replies: (replies ?? [])
      .filter((r) => r.suggestion_id === s.id)
      .map((r) => ({
        id: r.id as string,
        suggestion_id: r.suggestion_id as string,
        admin_username: r.admin_username as string,
        content: r.content as string,
        created_at: r.created_at as string,
        isOwner: session !== null && (r.admin_username as string) === session.username,
      })),
  }))
}

export async function addSuggestionAction(input: {
  category: string
  content: string
  nickname: string
}): Promise<ActionResult> {
  const content = input.content.trim()
  const nickname = input.nickname.trim()

  if (!content) return { ok: false, error: "내용을 입력해 주세요." }
  if (!nickname) return { ok: false, error: "닉네임을 입력해 주세요." }
  if (content.length > 300) return { ok: false, error: "내용은 300자 이내로 작성해 주세요." }
  if (nickname.length > 20) return { ok: false, error: "닉네임은 20자 이내로 작성해 주세요." }
  if (!["데이터수정", "기능건의", "기타"].includes(input.category)) {
    return { ok: false, error: "올바른 카테고리를 선택해 주세요." }
  }

  const supabase = createServiceClient()
  const userIp = await getClientIp()

  const { error } = await supabase.from("suggestions").insert({
    category: input.category,
    content,
    nickname,
    ...(userIp ? { user_ip: userIp } : {}),
  })

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function addReplyAction(input: {
  suggestionId: string
  content: string
}): Promise<ActionResult> {
  const session = await getSessionFromCookies()
  if (!session) return { ok: false, error: "권한이 없습니다." }

  const content = input.content.trim()
  if (!content) return { ok: false, error: "답변 내용을 입력해 주세요." }
  if (content.length > 300) return { ok: false, error: "답변은 300자 이내로 작성해 주세요." }

  const supabase = createServiceClient()
  const { error } = await supabase.from("suggestion_replies").insert({
    suggestion_id: input.suggestionId,
    admin_username: session.username,
    content,
  })

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function updateReplyAction(input: {
  replyId: string
  content: string
}): Promise<ActionResult> {
  const session = await getSessionFromCookies()
  if (!session) return { ok: false, error: "권한이 없습니다." }

  const content = input.content.trim()
  if (!content) return { ok: false, error: "답변 내용을 입력해 주세요." }
  if (content.length > 300) return { ok: false, error: "답변은 300자 이내로 작성해 주세요." }

  const supabase = createServiceClient()

  const { data: existing } = await supabase
    .from("suggestion_replies")
    .select("admin_username")
    .eq("id", input.replyId)
    .single()

  if (!existing) return { ok: false, error: "답변을 찾을 수 없습니다." }
  if ((existing.admin_username as string) !== session.username) {
    return { ok: false, error: "본인이 작성한 답변만 수정할 수 있습니다." }
  }

  const { error } = await supabase
    .from("suggestion_replies")
    .update({ content })
    .eq("id", input.replyId)

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function deleteReplyAction(replyId: string): Promise<ActionResult> {
  const session = await getSessionFromCookies()
  if (!session) return { ok: false, error: "권한이 없습니다." }

  const supabase = createServiceClient()

  const { data: existing } = await supabase
    .from("suggestion_replies")
    .select("admin_username")
    .eq("id", replyId)
    .single()

  if (!existing) return { ok: false, error: "답변을 찾을 수 없습니다." }
  if ((existing.admin_username as string) !== session.username) {
    return { ok: false, error: "본인이 작성한 답변만 삭제할 수 있습니다." }
  }

  const { error } = await supabase.from("suggestion_replies").delete().eq("id", replyId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function deleteSuggestionAction(suggestionId: string): Promise<ActionResult> {
  const session = await getSessionFromCookies()
  if (!session) return { ok: false, error: "권한이 없습니다." }

  const supabase = createServiceClient()

  const { data: suggestion } = await supabase
    .from("suggestions")
    .select("category, nickname, content")
    .eq("id", suggestionId)
    .single()

  if (!suggestion) return { ok: false, error: "건의사항을 찾을 수 없습니다." }

  if ((suggestion.category as string) === "기능건의" && session.role !== "creator") {
    return { ok: false, error: "제작자만 삭제할 수 있습니다." }
  }

  const { error } = await supabase.from("suggestions").delete().eq("id", suggestionId)
  if (error) return { ok: false, error: error.message }

  await insertAdminLog(
    session.username,
    "건의사항 삭제",
    `${suggestion.nickname as string}`,
    `category=${suggestion.category as string} content=${(suggestion.content as string).slice(0, 50)}`,
  )

  return { ok: true }
}

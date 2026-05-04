"use server"

import { revalidatePath } from "next/cache"
import { createServiceClient } from "@/lib/supabase/service"
import { getSessionFromCookies } from "@/lib/auth/admin"
import { insertAdminLog } from "@/lib/admin-log"
import { normalizeDecorativeBadgeAccent } from "@/lib/decorative-badge-accent"
import type { ActionResult } from "@/lib/types/tufelo"

const MAX_LABEL = 200

async function requireCreator() {
  const session = await getSessionFromCookies()
  if (!session || session.role !== "creator") {
    return { ok: false as const, error: "제작자 권한이 필요합니다." }
  }
  return { ok: true as const, session }
}

function revalidateBadgePaths() {
  revalidatePath("/creator")
  revalidatePath("/data-center")
}

export async function createDecorativeBadgeAction(input: {
  label: string
  sortOrder?: number
  accent?: string
}): Promise<ActionResult & { id?: string }> {
  const auth = await requireCreator()
  if (!auth.ok) return auth

  const label = input.label.trim()
  if (!label) return { ok: false, error: "뱃지 문구를 입력해 주세요." }
  if (label.length > MAX_LABEL) return { ok: false, error: `문구는 ${MAX_LABEL}자 이내입니다.` }

  const sortOrder = Number.isFinite(input.sortOrder) ? Math.round(Number(input.sortOrder)) : 0
  const accent = normalizeDecorativeBadgeAccent(input.accent)

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("decorative_badges")
    .insert({ label, sort_order: sortOrder, accent })
    .select("id")
    .single()

  if (error) return { ok: false, error: error.message }

  await insertAdminLog(auth.session.username, "전역 뱃지 생성", label)
  revalidateBadgePaths()
  return { ok: true, id: data?.id as string | undefined }
}

export async function updateDecorativeBadgeAction(input: {
  id: string
  label: string
  sortOrder?: number
  accent?: string
}): Promise<ActionResult> {
  const auth = await requireCreator()
  if (!auth.ok) return auth

  const label = input.label.trim()
  if (!label) return { ok: false, error: "뱃지 문구를 입력해 주세요." }
  if (label.length > MAX_LABEL) return { ok: false, error: `문구는 ${MAX_LABEL}자 이내입니다.` }

  const sortOrder = Number.isFinite(input.sortOrder) ? Math.round(Number(input.sortOrder)) : 0
  const accent = normalizeDecorativeBadgeAccent(input.accent)

  const supabase = createServiceClient()
  const { error } = await supabase
    .from("decorative_badges")
    .update({ label, sort_order: sortOrder, accent })
    .eq("id", input.id)

  if (error) return { ok: false, error: error.message }

  await insertAdminLog(auth.session.username, "전역 뱃지 수정", label)
  revalidateBadgePaths()
  return { ok: true }
}

export async function deleteDecorativeBadgeAction(id: string): Promise<ActionResult> {
  const auth = await requireCreator()
  if (!auth.ok) return auth

  const supabase = createServiceClient()
  const { data: row } = await supabase.from("decorative_badges").select("label").eq("id", id).maybeSingle()
  const { error } = await supabase.from("decorative_badges").delete().eq("id", id)

  if (error) return { ok: false, error: error.message }

  await insertAdminLog(auth.session.username, "전역 뱃지 삭제", row?.label ?? id)
  revalidateBadgePaths()
  return { ok: true }
}

/** 해당 뱃지 부여 선수를 전부 교체 */
export async function setDecorativeBadgeMembersAction(input: {
  badgeId: string
  memberIds: string[]
}): Promise<ActionResult> {
  const auth = await requireCreator()
  if (!auth.ok) return auth

  const uniq = [...new Set(input.memberIds.filter(Boolean))]
  const supabase = createServiceClient()

  const { error: delErr } = await supabase.from("member_decorative_badges").delete().eq("badge_id", input.badgeId)
  if (delErr) return { ok: false, error: delErr.message }

  if (uniq.length > 0) {
    const rows = uniq.map((member_id) => ({ badge_id: input.badgeId, member_id }))
    const { error: insErr } = await supabase.from("member_decorative_badges").insert(rows)
    if (insErr) return { ok: false, error: insErr.message }
  }

  const { data: b } = await supabase.from("decorative_badges").select("label").eq("id", input.badgeId).maybeSingle()
  await insertAdminLog(
    auth.session.username,
    "전역 뱃지 부여",
    b?.label ?? input.badgeId,
    `members=${uniq.length}`,
  )
  revalidateBadgePaths()
  return { ok: true }
}

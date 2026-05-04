"use server"

import { revalidatePath } from "next/cache"
import { createServiceClient } from "@/lib/supabase/service"
import { getStartingEloForTier } from "@/lib/elo"
import { getSessionFromCookies } from "@/lib/auth/admin"
import { insertAdminLog } from "@/lib/admin-log"
import type { Race, Tier, ActionResult } from "@/lib/types/tufelo"

/** 클랜원 관련 경로 캐시를 모두 무효화합니다 */
function revalidateMemberPaths() {
  revalidatePath("/")
  revalidatePath("/admin")
  revalidatePath("/ranking")
}

const ADMIN_MEMO_MAX_LEN = 2000

export async function addMemberAction(input: {
  name: string
  race: Race
  tier: Tier
}): Promise<ActionResult> {
  const session = await getSessionFromCookies()
  if (!session) return { ok: false, error: "권한이 없습니다." }

  const name = input.name.trim()
  if (!name) return { ok: false, error: "이름을 입력하세요." }

  const supabase = createServiceClient()
  const elo = getStartingEloForTier(input.tier)

  const { error } = await supabase.from("members").insert({
    name,
    race: input.race,
    tier: input.tier,
    elo,
    wins: 0,
    losses: 0,
    streak: 0,
    is_active: true,
  })

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "이미 같은 이름의 클랜원이 있습니다." }
    }
    return { ok: false, error: error.message }
  }

  await insertAdminLog(session.username, "클랜원 추가", name, `race=${input.race} tier=${input.tier}`)
  revalidateMemberPaths()
  return { ok: true }
}

export async function updateMemberAction(input: {
  id: string
  name: string
  race: Race
  tier: Tier
}): Promise<ActionResult> {
  const session = await getSessionFromCookies()
  if (!session) return { ok: false, error: "권한이 없습니다." }

  const name = input.name.trim()
  if (!name) return { ok: false, error: "이름을 입력하세요." }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from("members")
    .update({
      name,
      race: input.race,
      tier: input.tier,
    })
    .eq("id", input.id)

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "이미 같은 이름의 클랜원이 있습니다." }
    }
    return { ok: false, error: error.message }
  }

  await insertAdminLog(session.username, "클랜원 수정", name, `race=${input.race} tier=${input.tier}`)
  revalidateMemberPaths()
  return { ok: true }
}

/** 클랜 탈퇴 처리: is_active = false로 소프트 삭제. 전적 기록은 보존됩니다. */
export async function deleteMemberAction(id: string): Promise<ActionResult> {
  const session = await getSessionFromCookies()
  if (!session) return { ok: false, error: "권한이 없습니다." }

  const supabase = createServiceClient()

  const { data: member } = await supabase.from("members").select("name").eq("id", id).single()

  const { error } = await supabase
    .from("members")
    .update({ is_active: false })
    .eq("id", id)

  if (error) return { ok: false, error: error.message }

  await insertAdminLog(session.username, "클랜원 탈퇴처리", member?.name ?? id)
  revalidateMemberPaths()
  return { ok: true }
}

/** 클랜 복귀 처리: is_active = true로 복원. 시즌 경기 여부에 따라 ELO 결정. */
export async function reactivateMemberAction(id: string): Promise<ActionResult> {
  const session = await getSessionFromCookies()
  if (!session) return { ok: false, error: "권한이 없습니다." }

  const supabase = createServiceClient()

  const { data: member } = await supabase
    .from("members")
    .select("name, tier")
    .eq("id", id)
    .single()

  // 현재 활성 시즌 확인
  const { data: activeSeason } = await supabase
    .from("seasons")
    .select("id")
    .is("end_date", null)
    .maybeSingle()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let updateData: Record<string, any> = { is_active: true }

  if (activeSeason) {
    // 현재 시즌에서 이미 경기가 있는지 확인
    const { count } = await supabase
      .from("matches")
      .select("id", { count: "exact", head: true })
      .or(`player1_id.eq.${id},player2_id.eq.${id}`)
      .eq("season_id", activeSeason.id)

    if (!count || count === 0) {
      // 시즌 경기 없음 → 티어 초기값으로 리셋
      const elo = getStartingEloForTier((member?.tier as import("@/lib/types/tufelo").Tier) ?? 4)
      updateData = { is_active: true, elo, wins: 0, losses: 0, streak: 0 }
    }
    // 시즌 경기 있음 → 기존 ELO 유지 (is_active만 변경)
  }

  const { error } = await supabase.from("members").update(updateData).eq("id", id)

  if (error) return { ok: false, error: error.message }

  await insertAdminLog(session.username, "클랜원 복귀처리", member?.name ?? id)
  revalidateMemberPaths()
  return { ok: true }
}

/**
 * 완전 삭제(제명): 해당 선수의 전적 기록을 모두 삭제한 후 멤버를 DB에서 완전히 제거합니다.
 * 상대방의 ELO/전적은 복구되지 않습니다.
 * 탈퇴 처리(is_active = false)된 선수에게만 사용하세요.
 */
export async function permanentDeleteMemberAction(id: string): Promise<ActionResult> {
  const session = await getSessionFromCookies()
  if (!session) return { ok: false, error: "권한이 없습니다." }

  const supabase = createServiceClient()

  const { data: member } = await supabase.from("members").select("name").eq("id", id).single()
  const memberName = member?.name ?? id

  // 해당 선수가 참여한 모든 전적 먼저 삭제
  const { error: matchDeleteErr } = await supabase
    .from("matches")
    .delete()
    .or(`player1_id.eq.${id},player2_id.eq.${id}`)

  if (matchDeleteErr) return { ok: false, error: matchDeleteErr.message }

  // 멤버 완전 삭제
  const { error: memberDeleteErr } = await supabase
    .from("members")
    .delete()
    .eq("id", id)

  if (memberDeleteErr) return { ok: false, error: memberDeleteErr.message }

  await insertAdminLog(session.username, "클랜원 완전삭제", memberName)
  revalidateMemberPaths()
  return { ok: true }
}

/** 관리자 전용 내부 메모 (게스트 불가) */
export async function updateMemberAdminMemoAction(input: {
  id: string
  memo: string
}): Promise<ActionResult> {
  const session = await getSessionFromCookies()
  if (!session || session.role === "guest") {
    return { ok: false, error: "권한이 없습니다." }
  }

  const memo = input.memo.length > ADMIN_MEMO_MAX_LEN
    ? input.memo.slice(0, ADMIN_MEMO_MAX_LEN)
    : input.memo

  const supabase = createServiceClient()
  const { data: row } = await supabase.from("members").select("name").eq("id", input.id).single()

  const { error } = await supabase.from("members").update({ admin_memo: memo || null }).eq("id", input.id)

  if (error) return { ok: false, error: error.message }

  await insertAdminLog(session.username, "클랜원 메모 저장", row?.name ?? input.id)
  revalidateMemberPaths()
  return { ok: true }
}

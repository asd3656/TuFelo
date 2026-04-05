"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { getStartingEloForTier } from "@/lib/elo"
import { isAdminFromCookies } from "@/lib/auth/admin"
import type { Race, Tier } from "@/lib/types/tufelo"

export type ActionResult = { ok: true } | { ok: false; error: string }

export async function addMemberAction(input: {
  name: string
  race: Race
  tier: Tier
}): Promise<ActionResult> {
  const name = input.name.trim()
  if (!name) return { ok: false, error: "이름을 입력하세요." }

  const supabase = await createClient()
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

  revalidatePath("/")
  revalidatePath("/admin")
  revalidatePath("/ranking")
  return { ok: true }
}

export async function updateMemberAction(input: {
  id: string
  name: string
  race: Race
  tier: Tier
}): Promise<ActionResult> {
  const name = input.name.trim()
  if (!name) return { ok: false, error: "이름을 입력하세요." }

  const supabase = await createClient()
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

  revalidatePath("/")
  revalidatePath("/admin")
  revalidatePath("/ranking")
  return { ok: true }
}

/** 클랜 탈퇴 처리: is_active = false로 소프트 삭제. 전적 기록은 보존됩니다. */
export async function deleteMemberAction(id: string): Promise<ActionResult> {
  if (!(await isAdminFromCookies())) {
    return { ok: false, error: "권한이 없습니다." }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from("members")
    .update({ is_active: false })
    .eq("id", id)

  if (error) return { ok: false, error: error.message }

  revalidatePath("/")
  revalidatePath("/admin")
  revalidatePath("/ranking")
  return { ok: true }
}

/** 클랜 복귀 처리: is_active = true로 복원. */
export async function reactivateMemberAction(id: string): Promise<ActionResult> {
  if (!(await isAdminFromCookies())) {
    return { ok: false, error: "권한이 없습니다." }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from("members")
    .update({ is_active: true })
    .eq("id", id)

  if (error) return { ok: false, error: error.message }

  revalidatePath("/")
  revalidatePath("/admin")
  revalidatePath("/ranking")
  return { ok: true }
}

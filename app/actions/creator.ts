"use server"

import { revalidatePath } from "next/cache"
import { createServiceClient } from "@/lib/supabase/service"
import { getSessionFromCookies } from "@/lib/auth/admin"
import { insertAdminLog } from "@/lib/admin-log"
import bcrypt from "bcryptjs"
import type { ActionResult } from "@/lib/types/tufelo"

async function requireCreator() {
  const session = await getSessionFromCookies()
  if (!session || session.role !== "creator") {
    return { ok: false as const, error: "제작자 권한이 필요합니다." }
  }
  return { ok: true as const, session }
}

export async function addAdminAccountAction(input: {
  username: string
  password: string
}): Promise<ActionResult> {
  const auth = await requireCreator()
  if (!auth.ok) return auth

  const username = input.username.trim().toLowerCase()
  if (!username) return { ok: false, error: "아이디를 입력해 주세요." }
  if (input.password.length < 4) return { ok: false, error: "비밀번호는 4자 이상이어야 합니다." }

  const passwordHash = await bcrypt.hash(input.password, 10)
  const supabase = createServiceClient()

  const { error } = await supabase.from("admins").insert({
    username,
    password_hash: passwordHash,
    role: "admin",
  })

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "이미 존재하는 아이디입니다." }
    }
    return { ok: false, error: error.message }
  }

  await insertAdminLog(auth.session.username, "관리자 추가", username)
  revalidatePath("/creator")
  return { ok: true }
}

export async function deleteAdminAccountAction(
  targetUsername: string,
): Promise<ActionResult> {
  const auth = await requireCreator()
  if (!auth.ok) return auth

  if (targetUsername === auth.session.username) {
    return { ok: false, error: "자기 자신은 삭제할 수 없습니다." }
  }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from("admins")
    .delete()
    .eq("username", targetUsername)

  if (error) return { ok: false, error: error.message }

  await insertAdminLog(auth.session.username, "관리자 삭제", targetUsername)
  revalidatePath("/creator")
  return { ok: true }
}

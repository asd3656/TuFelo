"use server"

import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"
import { createServiceClient } from "@/lib/supabase/service"
import { ADMIN_SESSION_COOKIE } from "@/lib/auth/admin"
import bcrypt from "bcryptjs"
import type { ActionResult } from "@/lib/types/tufelo"

export type { ActionResult }

export async function loginAdminAction(
  username: string,
  password: string,
): Promise<ActionResult> {
  if (!username.trim() || !password) {
    return { ok: false, error: "아이디와 비밀번호를 입력해 주세요." }
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("admins")
    .select("username, password_hash, role")
    .eq("username", username.trim().toLowerCase())
    .single()

  if (error || !data) {
    return { ok: false, error: "아이디 또는 비밀번호가 올바르지 않습니다." }
  }

  const match = await bcrypt.compare(password, data.password_hash as string)
  if (!match) {
    return { ok: false, error: "아이디 또는 비밀번호가 올바르지 않습니다." }
  }

  const jar = await cookies()
  jar.set(ADMIN_SESSION_COOKIE, `${data.username}|${data.role}`, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
  })

  revalidatePath("/")
  revalidatePath("/admin")
  revalidatePath("/creator")
  return { ok: true }
}

export async function logoutAdminAction(): Promise<ActionResult> {
  const jar = await cookies()
  jar.delete(ADMIN_SESSION_COOKIE)
  revalidatePath("/")
  revalidatePath("/admin")
  revalidatePath("/creator")
  return { ok: true }
}

export async function changePasswordAction(
  username: string,
  currentPassword: string,
  newPassword: string,
): Promise<ActionResult> {
  if (!username.trim() || !currentPassword || !newPassword) {
    return { ok: false, error: "모든 항목을 입력해 주세요." }
  }
  if (newPassword.length < 4) {
    return { ok: false, error: "새 비밀번호는 4자 이상이어야 합니다." }
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("admins")
    .select("password_hash")
    .eq("username", username.trim().toLowerCase())
    .single()

  if (error || !data) {
    return { ok: false, error: "아이디 또는 현재 비밀번호가 올바르지 않습니다." }
  }

  const match = await bcrypt.compare(currentPassword, data.password_hash as string)
  if (!match) {
    return { ok: false, error: "아이디 또는 현재 비밀번호가 올바르지 않습니다." }
  }

  const newHash = await bcrypt.hash(newPassword, 10)
  const { error: updateErr } = await supabase
    .from("admins")
    .update({ password_hash: newHash })
    .eq("username", username.trim().toLowerCase())

  if (updateErr) return { ok: false, error: updateErr.message }

  return { ok: true }
}

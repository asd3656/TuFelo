"use server"

import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"
import { ADMIN_SESSION_COOKIE } from "@/lib/auth/admin"

export type ActionResult = { ok: true } | { ok: false; error: string }

export async function loginAdminAction(password: string): Promise<ActionResult> {
  const expected = process.env.ADMIN_PASSWORD
  if (!expected) {
    return { ok: false, error: "서버에 ADMIN_PASSWORD가 설정되지 않았습니다." }
  }
  if (password !== expected) {
    return { ok: false, error: "암호가 올바르지 않습니다." }
  }
  const jar = await cookies()
  jar.set(ADMIN_SESSION_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
  })
  revalidatePath("/")
  revalidatePath("/admin")
  return { ok: true }
}

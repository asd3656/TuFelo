"use server"

import { revalidatePath } from "next/cache"
import { createServiceClient } from "@/lib/supabase/service"
import { getSessionFromCookies } from "@/lib/auth/admin"
import { insertAdminLog } from "@/lib/admin-log"
import {
  EMPTY_SITE_NOTICE,
  type SiteNoticeData,
  type SiteNoticeItem,
  isValidSiteNoticeItemSize,
} from "@/lib/site-notice"
import type { ActionResult } from "@/lib/types/tufelo"

/** 공지 본문 + DB 갱신 시각(하이라이트용) */
export type SiteNoticePayload = {
  notice: SiteNoticeData
  /** ISO 문자열. 테이블 없음·오류 시 null */
  updatedAt: string | null
}

const MAX_ITEMS = 30
const MAX_TEXT_PER_ITEM = 2000
const MAX_TITLE = 200

function normalizeItems(raw: unknown): SiteNoticeItem[] {
  if (!Array.isArray(raw)) return []
  const out: SiteNoticeItem[] = []
  for (const row of raw) {
    if (out.length >= MAX_ITEMS) break
    if (!row || typeof row !== "object") continue
    const text = typeof (row as { text?: unknown }).text === "string" ? (row as { text: string }).text : ""
    const t = text.slice(0, MAX_TEXT_PER_ITEM)
    if (!t.trim()) continue
    const sizeRaw = (row as { size?: unknown }).size
    const size =
      typeof sizeRaw === "string" && isValidSiteNoticeItemSize(sizeRaw) ? sizeRaw : undefined
    out.push(size ? { text: t, size } : { text: t })
  }
  return out
}

export async function getSiteNoticeAction(): Promise<SiteNoticePayload> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("site_notice")
    .select("title, items, updated_at")
    .eq("id", 1)
    .maybeSingle()

  if (error || !data) {
    return { notice: EMPTY_SITE_NOTICE, updatedAt: null }
  }

  const titleRaw = typeof data.title === "string" ? data.title.trim() : ""
  const title = titleRaw ? titleRaw.slice(0, MAX_TITLE) : EMPTY_SITE_NOTICE.title
  const rawUpd = data.updated_at as string | null | undefined
  const updatedAt =
    typeof rawUpd === "string" && rawUpd.trim() ? rawUpd : null

  return {
    notice: {
      title,
      items: normalizeItems(data.items),
    },
    updatedAt,
  }
}

export async function updateSiteNoticeAction(input: SiteNoticeData): Promise<ActionResult> {
  const session = await getSessionFromCookies()
  if (!session || session.role !== "creator") {
    return { ok: false, error: "제작자만 공지를 수정할 수 있습니다." }
  }

  const title = input.title.trim().slice(0, MAX_TITLE)
  if (!title) {
    return { ok: false, error: "제목을 입력해 주세요." }
  }

  const items: SiteNoticeItem[] = []
  for (const row of input.items) {
    if (items.length >= MAX_ITEMS) break
    const text = row.text.trim().slice(0, MAX_TEXT_PER_ITEM)
    if (!text) continue
    const size = row.size && isValidSiteNoticeItemSize(row.size) ? row.size : undefined
    items.push(size ? { text, size } : { text })
  }

  if (items.length === 0) {
    return { ok: false, error: "공지 항목을 한 줄 이상 입력해 주세요." }
  }

  const supabase = createServiceClient()
  const { error } = await supabase.from("site_notice").upsert(
    {
      id: 1,
      title,
      items,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  )

  if (error) {
    return { ok: false, error: error.message }
  }

  await insertAdminLog(session.username, "사이트 공지 수정", title)
  revalidatePath("/", "layout")
  return { ok: true }
}

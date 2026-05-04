import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import type { DecorativeBadgeAccent } from "@/lib/decorative-badge-accent"
import { normalizeDecorativeBadgeAccent } from "@/lib/decorative-badge-accent"

export type DecorativeBadgeRow = {
  id: string
  label: string
  sortOrder: number
  accent: DecorativeBadgeAccent
}

/** 데이터센터: memberId → 뱃지 목록(정렬됨) */
export async function fetchDecorativeByMemberForDataCenter(): Promise<
  Record<string, { id: string; label: string; accent: DecorativeBadgeAccent }[]>
> {
  const supabase = await createClient()
  const { data, error } = await supabase.from("member_decorative_badges").select(`
    member_id,
    decorative_badges ( id, label, sort_order, accent )
  `)

  if (error || !data?.length) {
    return {}
  }

  const byMember: Record<string, { id: string; label: string; sortOrder: number; accent: DecorativeBadgeAccent }[]> =
    {}
  for (const row of data) {
    const mid = row.member_id as string
    const raw = row.decorative_badges as
      | { id: string; label: string; sort_order: number; accent?: string | null }
      | { id: string; label: string; sort_order: number; accent?: string | null }[]
      | null
    const b = Array.isArray(raw) ? raw[0] : raw
    if (!b?.id) continue
    if (!byMember[mid]) byMember[mid] = []
    byMember[mid].push({
      id: b.id,
      label: b.label,
      sortOrder: b.sort_order ?? 0,
      accent: normalizeDecorativeBadgeAccent(b.accent),
    })
  }

  const out: Record<string, { id: string; label: string; accent: DecorativeBadgeAccent }[]> = {}
  for (const [mid, list] of Object.entries(byMember)) {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, "ko"))
    out[mid] = list.map(({ id, label, accent }) => ({ id, label, accent }))
  }
  return out
}

export type CreatorDecorativeBadge = DecorativeBadgeRow & { memberIds: string[] }

/** 제작자 페이지: 뱃지 + 부여된 member id 목록 */
export async function fetchDecorativeBadgesForCreator(): Promise<CreatorDecorativeBadge[]> {
  const supabase = createServiceClient()
  const { data: badges, error: bErr } = await supabase
    .from("decorative_badges")
    .select("id, label, sort_order, accent")
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true })
  if (bErr || !badges) return []

  const { data: links, error: lErr } = await supabase
    .from("member_decorative_badges")
    .select("badge_id, member_id")
  if (lErr) return []

  const byBadge = new Map<string, string[]>()
  for (const r of links ?? []) {
    const bid = r.badge_id as string
    const mid = r.member_id as string
    if (!byBadge.has(bid)) byBadge.set(bid, [])
    byBadge.get(bid)!.push(mid)
  }

  return badges.map((row) => ({
    id: row.id as string,
    label: row.label as string,
    sortOrder: (row.sort_order as number) ?? 0,
    accent: normalizeDecorativeBadgeAccent(row.accent as string | null | undefined),
    memberIds: byBadge.get(row.id as string) ?? [],
  }))
}

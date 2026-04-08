import { createClient } from "@/lib/supabase/server"
import type { ClanMember, Race, Tier } from "@/lib/types/tufelo"

type MemberRow = {
  id: string
  name: string
  race: string
  tier: number
  elo: number
  wins: number
  losses: number
  streak: number
  is_active: boolean
}

function toClanMember(row: MemberRow): ClanMember {
  return {
    id: row.id,
    name: row.name,
    race: row.race as Race,
    tier: row.tier as Tier,
    elo: row.elo,
    wins: row.wins,
    losses: row.losses,
    streak: row.streak,
    isActive: row.is_active,
  }
}

/** 관리자 명단용: 활성 + 비활성 전체 반환 */
export async function fetchMembers(): Promise<ClanMember[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("members")
    .select("id, name, race, tier, elo, wins, losses, streak, is_active")
    .order("is_active", { ascending: false })
    .order("name")

  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => toClanMember(r as MemberRow))
}

/** 전적 등록 선수 목록용: 활성 멤버만 반환 */
export async function fetchActiveMembers(): Promise<ClanMember[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("members")
    .select("id, name, race, tier, elo, wins, losses, streak, is_active")
    .eq("is_active", true)
    .order("name")

  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => toClanMember(r as MemberRow))
}

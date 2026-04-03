import { createClient } from "@/lib/supabase/server"
import type { ClanMember } from "@/lib/types/tufelo"
import type { Race, Tier } from "@/lib/types/tufelo"

type MemberRow = {
  id: string
  name: string
  race: string
  tier: number
  elo: number
  wins: number
  losses: number
  streak: number
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
  }
}

export async function fetchMembers(): Promise<ClanMember[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("members")
    .select("id, name, race, tier, elo, wins, losses, streak")
    .order("name")

  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => toClanMember(r as MemberRow))
}

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

function csv(searchParams: URLSearchParams, key: string): string[] {
  return (searchParams.get(key) ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
}

function csvInts(searchParams: URLSearchParams, key: string): number[] {
  return csv(searchParams, key)
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v))
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const mapNames = csv(searchParams, "map")
    const matchTypes = csv(searchParams, "matchType")
    const races = csv(searchParams, "race")
    const tiers = csvInts(searchParams, "tier")
    const playerFilterEnabled = searchParams.get("players") === "on"
    const player1Query = searchParams.get("player")?.trim() ?? ""
    const player2Query = searchParams.get("player2")?.trim() ?? ""
    const minGames = Number(searchParams.get("minGames") ?? "0")
    const recentDays = Number(searchParams.get("recentDays") ?? "0")

    const supabase = await createClient()
    const { data, error } = await supabase.rpc("get_data_center_season_trend_v2", {
      p_map_names: mapNames.length > 0 ? mapNames : null,
      p_match_types: matchTypes.length > 0 ? matchTypes : null,
      p_races: races.length > 0 ? races : null,
      p_tiers: tiers.length > 0 ? tiers : null,
      p_player_filter_enabled: playerFilterEnabled,
      p_player1_query: player1Query || null,
      p_player2_query: player2Query || null,
      p_min_games: Number.isFinite(minGames) ? minGames : 0,
      p_recent_days: Number.isFinite(recentDays) ? recentDays : 0,
    })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(Array.isArray(data) ? data : [])
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

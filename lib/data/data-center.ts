import { createClient } from "@/lib/supabase/server"
import { fetchSeasons } from "@/lib/data/seasons"
import {
  parseDataCenterMatches,
  parseDataCenterMembers,
  parseDataCenterSeasons,
} from "@/lib/data/data-center-parse"
import type { Race, Season } from "@/lib/types/tufelo"

export interface DataCenterMember {
  id: string
  name: string
  race: Race
  tier: number | null
}

export interface DataCenterMatch {
  id: string
  player1Id: string
  player2Id: string
  winnerId: string
  mapName: string
  matchType: string
  playedDate: string
  seasonId: string | null
  player1EloBefore: number | null
  player2EloBefore: number | null
  player1EloDelta: number | null
  player2EloDelta: number | null
}

export interface DataCenterInitialData {
  members: DataCenterMember[]
  matches: DataCenterMatch[]
  seasons: Season[]
}

/** RPC `get_data_center_page_data` 와 동일 상한 (마이그레이션 LEAST 상한 50000) */
const DATA_CENTER_MATCH_LIMIT = 15000

/**
 * 데이터센터 초기 로드.
 * 1) Supabase RPC `get_data_center_page_data` 가 있으면 members·matches·seasons 를 한 번에 로드
 * 2) 없거나 오류 시 기존 다중 쿼리로 폴백
 */
export async function fetchDataCenterInitialData(): Promise<DataCenterInitialData> {
  const supabase = await createClient()

  const { data: rpcBundle, error: rpcError } = await supabase.rpc("get_data_center_page_data", {
    p_match_limit: DATA_CENTER_MATCH_LIMIT,
  })

  if (!rpcError && rpcBundle && typeof rpcBundle === "object" && !Array.isArray(rpcBundle)) {
    const b = rpcBundle as Record<string, unknown>
    return {
      members: parseDataCenterMembers(b.members),
      matches: parseDataCenterMatches(b.matches),
      seasons: parseDataCenterSeasons(b.seasons),
    }
  }

  const [membersRes, matchesRes, seasons] = await Promise.all([
    supabase.from("members").select("id, name, race, tier").eq("is_active", true).order("name", { ascending: true }),
    supabase
      .from("matches")
      .select(
        "id, player1_id, player2_id, winner_id, map_name, match_type, played_date, season_id, player1_elo_before, player2_elo_before, player1_elo_delta, player2_elo_delta",
      )
      .order("played_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(DATA_CENTER_MATCH_LIMIT),
    fetchSeasons(),
  ])

  if (membersRes.error) throw new Error(membersRes.error.message)
  if (matchesRes.error) throw new Error(matchesRes.error.message)

  const members: DataCenterMember[] = (membersRes.data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    race: row.race as Race,
    tier: row.tier !== null && row.tier !== undefined ? Number(row.tier) : null,
  }))

  const matches: DataCenterMatch[] = (matchesRes.data ?? []).map((row) => ({
    id: row.id as string,
    player1Id: row.player1_id as string,
    player2Id: row.player2_id as string,
    winnerId: row.winner_id as string,
    mapName: (row.map_name as string) ?? "",
    matchType: (row.match_type as string | null) ?? "미분류",
    playedDate: row.played_date as string,
    seasonId: (row.season_id as string | null) ?? null,
    player1EloBefore:
      row.player1_elo_before !== null && row.player1_elo_before !== undefined ? Number(row.player1_elo_before) : null,
    player2EloBefore:
      row.player2_elo_before !== null && row.player2_elo_before !== undefined ? Number(row.player2_elo_before) : null,
    player1EloDelta: row.player1_elo_delta !== null && row.player1_elo_delta !== undefined ? Number(row.player1_elo_delta) : null,
    player2EloDelta: row.player2_elo_delta !== null && row.player2_elo_delta !== undefined ? Number(row.player2_elo_delta) : null,
  }))

  return { members, matches, seasons }
}

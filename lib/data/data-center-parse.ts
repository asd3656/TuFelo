import type { Race, Season } from "@/lib/types/tufelo"
import type { DataCenterMatch, DataCenterMember } from "@/lib/data/data-center"

const races: Race[] = ["T", "P", "Z"]

function isRace(x: unknown): x is Race {
  return typeof x === "string" && (races as string[]).includes(x)
}

export function parseDataCenterMembers(rows: unknown): DataCenterMember[] {
  if (!Array.isArray(rows)) return []
  const out: DataCenterMember[] = []
  for (const r of rows) {
    if (!r || typeof r !== "object") continue
    const o = r as Record<string, unknown>
    const id = typeof o.id === "string" ? o.id : null
    const name = typeof o.name === "string" ? o.name : null
    const race = isRace(o.race) ? o.race : null
    const tier = o.tier === null || o.tier === undefined ? null : Number(o.tier)
    if (id && name && race) out.push({ id, name, race, tier: tier !== null && Number.isFinite(tier) ? tier : null })
  }
  return out
}

export function parseDataCenterMatches(rows: unknown): DataCenterMatch[] {
  if (!Array.isArray(rows)) return []
  const out: DataCenterMatch[] = []
  for (const r of rows) {
    if (!r || typeof r !== "object") continue
    const o = r as Record<string, unknown>
    const num = (v: unknown): number | null =>
      v === null || v === undefined ? null : typeof v === "number" && Number.isFinite(v) ? v : Number(v)
    const id = typeof o.id === "string" ? o.id : null
    const player1Id = typeof o.player1Id === "string" ? o.player1Id : null
    const player2Id = typeof o.player2Id === "string" ? o.player2Id : null
    const winnerId = typeof o.winnerId === "string" ? o.winnerId : null
    if (!id || !player1Id || !player2Id || !winnerId) continue

    const mapName = typeof o.mapName === "string" ? o.mapName : ""
    const matchType = typeof o.matchType === "string" ? o.matchType : "미분류"
    const playedDate = typeof o.playedDate === "string" ? o.playedDate : ""
    if (!playedDate) continue
    const seasonId =
      o.seasonId === null || o.seasonId === undefined
        ? null
        : typeof o.seasonId === "string"
          ? o.seasonId
          : null

    const p1b = num(o.player1EloBefore)
    const p2b = num(o.player2EloBefore)
    const p1d = num(o.player1EloDelta)
    const p2d = num(o.player2EloDelta)

    out.push({
      id,
      player1Id,
      player2Id,
      winnerId,
      mapName,
      matchType,
      playedDate,
      seasonId,
      player1EloBefore: p1b !== null && Number.isFinite(p1b) ? p1b : null,
      player2EloBefore: p2b !== null && Number.isFinite(p2b) ? p2b : null,
      player1EloDelta: p1d !== null && Number.isFinite(p1d) ? p1d : null,
      player2EloDelta: p2d !== null && Number.isFinite(p2d) ? p2d : null,
    })
  }
  return out
}

export function parseDataCenterSeasons(rows: unknown): Season[] {
  if (!Array.isArray(rows)) return []
  const out: Season[] = []
  for (const r of rows) {
    if (!r || typeof r !== "object") continue
    const o = r as Record<string, unknown>
    const id = typeof o.id === "string" ? o.id : null
    const name = typeof o.name === "string" ? o.name : null
    const startDate = typeof o.startDate === "string" ? o.startDate : null
    const createdAt = typeof o.createdAt === "string" ? o.createdAt : null
    if (!id || !name || !startDate || !createdAt) continue
    const endDate =
      o.endDate === null || o.endDate === undefined
        ? null
        : typeof o.endDate === "string"
          ? o.endDate
          : null
    out.push({ id, name, startDate, endDate, createdAt })
  }
  return out
}

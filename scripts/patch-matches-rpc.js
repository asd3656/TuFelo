const fs = require("fs")
const path = require("path")

const p = path.join(__dirname, "..", "app", "actions", "matches.ts")
let s = fs.readFileSync(p, "utf8")

const delStart = s.indexOf("  const { error: _removedUp1 }")
const delEnd = s.indexOf("\n\n  // 현재 시�� 경기만으로 연속��패 재계산", delStart)
if (delStart === -1 || delEnd === -1) {
  console.error("delete block markers missing")
  process.exit(1)
}

const delInsert = `  const { error: delErr } = await supabase.from("matches").delete().eq("id", matchId)
  if (delErr) {
    const { error: restoreErr } = await applySeasonMatchMemberUpdatesRpc(supabase, {
      winnerId,
      loserId,
      winnerElo: oldWinnerElo,
      loserElo: oldLoserElo,
      winnerStreak: 0,
      loserStreak: 0,
    })
    if (restoreErr) {
      return {
        ok: false,
        error: \�제 실패 후 ��구도 실패: \${delErr.message} / \${restoreErr.message}\`,
      }
    }
    const rs1 = await computeStreakForMember(supabase, p1, rowSeasonId)
    const rs2 = await computeStreakForMember(supabase, p2, rowSeasonId)
    await supabase.from("members").update({ streak: rs1 }).eq("id", p1)
    await supabase.from("members").update({ streak: rs2 }).eq("id", p2)
    return { ok: false, error: delErr.message }
  }`

s = s.slice(0, delStart) + delInsert + s.slice(delEnd)

const updStart = s.indexOf("  // 현재 활성 시�� 경기: ELO 역산 후 재계산")
const updEnd = s.indexOf("\n\n  // 현재 시�� 경기만으로 연속��패 재계산", updStart)
if (updStart === -1 || updEnd === -1) {
  console.error("update block markers missing")
  process.exit(1)
}

const updInsert = `  // 현재� 경기: undo RPC → 경�신 → apply RPC (��패 원자적)
  const oldWinnerId = row.winner_id as string
  const oldLoserId = oldWinnerId === oldP1Id ? oldP2Id : oldP1Id
  const oldD1n = Number(row.player1_elo_delta ?? 0)
  const oldD2n = Number(row.player2_elo_delta ?? 0)

  const { data: m1, error: e1 } = await supabase
    .from("members")
    .select("id, name, elo")
    .eq("id", oldP1Id)
    .single()
  const { data: m2, error: e2 } = await supabase
    .from("members")
    .select("id, name, elo")
    .eq("id", oldP2Id)
    .single()
  if (e1 || !m1 || e2 || !m2) {
    return { ok: false, error: "선수 정보를 불러�� 수 없습니다." }
  }

  const oldWinnerElo = oldWinnerId === oldP1Id ? (m1.elo as number) : (m2.elo as number)
  const oldLoserElo = oldWinnerId === oldP1Id ? (m2.elo as number) : (m1.elo as number)

  async function restoreOldSeasonMatchEffect() {
    await applySeasonMatchMemberUpdatesRpc(supabase, {
      winnerId: oldWinnerId,
      loserId: oldLoserId,
      winnerElo: oldWinnerElo,
      loserElo: oldLoserElo,
      winnerStreak: 0,
      loserStreak: 0,
    })
    const rs1 = await computeStreakForMember(supabase, oldP1Id, rowSeasonId)
    const rs2 = await computeStreakForMember(supabase, oldP2Id, rowSeasonId)
    await supabase.from("members").update({ streak: rs1 }).eq("id", oldP1Id)
    await supabase.from("members").update({ streak: rs2 }).eq("id", oldP2Id)
  }

  const { error: undoErr } = await applySeasonMatchUndoStatsRpc(supabase, {
    player1Id: oldP1Id,
    player2Id: oldP2Id,
    winnerId: oldWinnerId,
    player1EloDelta: oldD1n,
    player2EloDelta: oldD2n,
  })
  if (undoErr) {
    return { ok: false, error: undoErr.message }
  }

  const { data: m1b, error: e1b } = await supabase.from("members").select("elo").eq("id", oldP1Id).single()
  const { data: m2b, error: e2b } = await supabase.from("members").select("elo").eq("id", oldP2Id).single()
  if (e1b || !m1b || e2b || !m2b) {
    await restoreOldSeasonMatchEffect()
    return { ok: false, error: "선수 정보를 불러�� 수 없습니다." }
  }

  const baseElo1 = m1b.elo as number
  const baseElo2 = m2b.elo as number

  const newWinnerId = input.isPlayer1Winner ? oldP1Id : oldP2Id
  const newLoserId = input.isPlayer1Winner ? oldP2Id : oldP1Id
  const winnerBaseElo = input.isPlayer1Winner ? baseElo1 : baseElo2
  const loserBaseElo = input.isPlayer1Winner ? baseElo2 : baseElo1

  const { newWinnerElo, newLoserElo, winnerDelta, loserDelta } = computeEloMatch(winnerBaseElo, loserBaseElo)

  const newD1 = input.isPlayer1Winner ? winnerDelta : loserDelta
  const newD2 = input.isPlayer1Winner ? loserDelta : winnerDelta

  const { error: updMatchErr } = await supabase
    .from("matches")
    .update({
      winner_id: newWinnerId,
      map_name: input.mapName,
      match_type: input.matchType,
      played_date: input.playedDate,
      player1_elo_before: baseElo1,
      player2_elo_before: baseElo2,
      player1_elo_delta: newD1,
      player2_elo_delta: newD2,
    })
    .eq("id", input.matchId)

  if (updMatchErr) {
    await restoreOldSeasonMatchEffect()
    return { ok: false, error: updMatchErr.message }
  }

  const { error: applyErr } = await applySeasonMatchMemberUpdatesRpc(supabase, {
    winnerId: newWinnerId,
    loserId: newLoserId,
    winnerElo: newWinnerElo,
    loserElo: newLoserElo,
    winnerStreak: 0,
    loserStreak: 0,
  })

  if (applyErr) {
    await supabase
      .from("matches")
      .update({
        winner_id: oldWinnerId,
        map_name: row.map_name,
        match_type: row.match_type,
        played_date: row.played_date,
        player1_elo_before: row.player1_elo_before,
        player2_elo_before: row.player2_elo_before,
        player1_elo_delta: row.player1_elo_delta,
        player2_elo_delta: row.player2_elo_delta,
      })
      .eq("id", input.matchId)
    await restoreOldSeasonMatchEffect()
    return { ok: false, error: applyErr.message }
  }`

s = s.slice(0, updStart) + updInsert + s.slice(updEnd)
fs.writeFileSync(p, s, "utf8")
console.log("patched", p)

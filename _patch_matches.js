const fs = require("fs")
const p = "D:/project/TuFelo/app/actions/matches.ts"
const lines = fs.readFileSync(p, "utf8").split(/\r?\n/)
const i0 = lines.findIndex((l) => l.includes("_removedUp1"))
const i1 = lines.findIndex((l, i) => i > i0 && l.trim().startsWith("// ") && l.includes("연속��패"))
if (i0 < 0 || i1 < 0) {
  console.error("markers not found", { i0, i1 })
  process.exit(1)
}
const insert = [
  `  const { error: delErr } = await supabase.from("matches").delete().eq("id", matchId)`,
  `  if (delErr) {`,
  `    const { error: restoreErr } = await applySeasonMatchMemberUpdatesRpc(supabase, {`,
  `      winnerId,`,
  `      loserId,`,
  `      winnerElo: oldWinnerElo,`,
  `      loserElo: oldLoserElo,`,
  `      winnerStreak: 0,`,
  `      loserStreak: 0,`,
  `    })`,
  `    if (restoreErr) {`,
  `      return {`,
  `        ok: false,`,
  `        error: \`Delete failed; member restore also failed: \${delErr.message} / \${restoreErr.message}\`,`,
  `      }`,
  `    }`,
  `    const rs1 = await computeStreakForMember(supabase, p1, rowSeasonId)`,
  `    const rs2 = await computeStreakForMember(supabase, p2, rowSeasonId)`,
  `    await supabase.from("members").update({ streak: rs1 }).eq("id", p1)`,
  `    await supabase.from("members").update({ streak: rs2 }).eq("id", p2)`,
  `    return { ok: false, error: delErr.message }`,
  `  }`,
]
const out = [...lines.slice(0, i0), ...insert, ...lines.slice(i1)]
fs.writeFileSync(p, out.join("\n"), "utf8")
console.log("patched lines", i0, "to", i1 - 1)

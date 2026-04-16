/**
 * Resolve dashboard player search text to member IDs.
 *
 * If any member's `id` or `name` equals the query (case-insensitive), return only
 * those members — avoids e.g. "ko" matching "Koeun" when someone is literally named "ko".
 * Otherwise fall back to substring match on `name` (previous behavior).
 */
export function resolveMemberIdsByPlayerQuery(
  members: { id: string; name: string }[],
  query: string,
): string[] {
  const q = query.trim().toLowerCase()
  if (!q) return []

  const exactIds = new Set<string>()
  for (const m of members) {
    if (m.id.toLowerCase() === q || m.name.trim().toLowerCase() === q) {
      exactIds.add(m.id)
    }
  }
  if (exactIds.size > 0) return [...exactIds]

  return members.filter((m) => m.name.toLowerCase().includes(q)).map((m) => m.id)
}

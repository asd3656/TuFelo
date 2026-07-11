import { NextResponse } from "next/server"
import { getLauncherStats } from "@/lib/data/launcher-stats"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const data = await getLauncherStats()
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

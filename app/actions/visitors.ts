"use server"

import { createServiceClient } from "@/lib/supabase/service"
import { getSeoulDateString } from "@/lib/date-seoul"

export async function incrementVisitorAction(): Promise<number> {
  const supabase = createServiceClient()
  const today = getSeoulDateString()

  const { data, error } = await supabase.rpc("increment_daily_visitor", {
    p_date: today,
  })

  if (error || data === null) return 0
  return data as number
}

export async function getVisitorCountAction(): Promise<number> {
  const supabase = createServiceClient()
  const today = getSeoulDateString()

  const { data } = await supabase
    .from("daily_visitors")
    .select("count")
    .eq("visit_date", today)
    .single()

  if (!data) return 0
  return (data.count as number) ?? 0
}

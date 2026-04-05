import { createClient } from "@supabase/supabase-js"

/**
 * Service Role 클라이언트 — RLS를 우회하므로 서버 액션에서만 사용할 것.
 * 절대로 클라이언트 컴포넌트나 브라우저에서 노출되면 안 됩니다.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  })
}

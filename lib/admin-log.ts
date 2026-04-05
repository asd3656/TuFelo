import { createServiceClient } from "@/lib/supabase/service"

export async function insertAdminLog(
  adminUsername: string,
  action: string,
  target?: string,
  detail?: string,
) {
  try {
    const supabase = createServiceClient()
    await supabase.from("admin_logs").insert({
      admin_username: adminUsername,
      action,
      target: target ?? null,
      detail: detail ?? null,
    })
  } catch {
    // 로그 실패가 메인 작업에 영향을 주지 않도록 예외를 무시
  }
}

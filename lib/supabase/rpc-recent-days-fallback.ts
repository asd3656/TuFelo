type RpcErrorLike = { message?: string | null } | null

type RpcResponse<T> = {
  data: T | null
  error: RpcErrorLike
}

type RpcClientLike = {
  rpc<T>(fn: string, args?: Record<string, unknown> | null): Promise<RpcResponse<T>>
}

function shouldRetryWithoutRecentDays(functionName: string, error: RpcErrorLike): boolean {
  const message = (error?.message ?? "").toLowerCase()
  if (!message) return false
  return (
    message.includes("p_recent_days") ||
    message.includes("does not exist") ||
    message.includes(`function public.${functionName}`.toLowerCase())
  )
}

/**
 * 최신 RPC 시그니처(`p_recent_days`)를 우선 호출하고,
 * 구버전 시그니처 불일치 시 `p_recent_days`를 제거해 1회 재시도합니다.
 */
export async function callRpcWithRecentDaysFallback<T>(
  supabase: RpcClientLike,
  functionName: string,
  args: Record<string, unknown>,
): Promise<RpcResponse<T>> {
  const first = await supabase.rpc<T>(functionName, args)
  if (!first.error || !shouldRetryWithoutRecentDays(functionName, first.error)) {
    return first
  }

  console.warn(
    `[supabase-rpc] Retrying ${functionName} without p_recent_days due to signature mismatch: ${
      first.error.message ?? "unknown error"
    }`,
  )

  const { p_recent_days: _ignored, ...legacyArgs } = args
  return supabase.rpc<T>(functionName, legacyArgs)
}


"use client"

import { useCallback, useState } from "react"
import { Share2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type ShareFilterUrlButtonProps = {
  className?: string
}

export function ShareFilterUrlButton({ className }: ShareFilterUrlButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleShare = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error("Failed to copy filter URL:", error)
    }
  }, [])

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn(
        "shrink-0 gap-1.5 text-foreground hover:text-foreground dark:hover:text-foreground",
        className,
      )}
      onClick={handleShare}
      title="현재 필터가 적용된 URL을 복사합니다"
    >
      <Share2 className="h-4 w-4" />
      {copied ? "복사됨" : "공유하기"}
    </Button>
  )
}

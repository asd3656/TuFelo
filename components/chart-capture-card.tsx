"use client"

import { useCallback, useRef, useState, type ComponentProps } from "react"
import { Camera, Download, Loader2 } from "lucide-react"
import { toPng } from "html-to-image"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

type ChartCaptureCardProps = ComponentProps<typeof Card> & {
  captureFilename?: string
}

export function ChartCaptureCard({
  className,
  captureFilename = "data-center-chart",
  children,
  ...cardProps
}: ChartCaptureCardProps) {
  const captureRef = useRef<HTMLDivElement>(null)
  const [capturing, setCapturing] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewFilename, setPreviewFilename] = useState("")

  const handleCapture = useCallback(async () => {
    const node = captureRef.current
    if (!node || capturing) return

    setCapturing(true)
    try {
      const cardEl = node.firstElementChild as HTMLElement | null
      const dataUrl = await toPng(node, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: cardEl
          ? getComputedStyle(cardEl).backgroundColor
          : getComputedStyle(document.documentElement).backgroundColor,
      })

      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, "")
      setPreviewUrl(dataUrl)
      setPreviewFilename(`${captureFilename}-${timestamp}.png`)
      setPreviewOpen(true)
    } catch (error) {
      console.error("Chart capture failed:", error)
    } finally {
      setCapturing(false)
    }
  }, [captureFilename, capturing])

  const handleDownload = useCallback(() => {
    if (!previewUrl) return
    const link = document.createElement("a")
    link.download = previewFilename
    link.href = previewUrl
    link.click()
  }, [previewFilename, previewUrl])

  const handlePreviewOpenChange = useCallback((open: boolean) => {
    setPreviewOpen(open)
    if (!open) setPreviewUrl(null)
  }, [])

  return (
    <>
      <div className={cn("relative", className)}>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-2 top-2 z-20 h-8 w-8 opacity-70 hover:bg-muted/80 hover:opacity-100"
          onClick={handleCapture}
          disabled={capturing}
          aria-label="차트 캡처"
          title="캡처 미리보기"
        >
          {capturing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
        </Button>
        <div ref={captureRef}>
          <Card {...cardProps}>{children}</Card>
        </div>
      </div>

      <Dialog open={previewOpen} onOpenChange={handlePreviewOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-4xl gap-0 overflow-hidden p-0 sm:max-w-4xl">
          <DialogHeader className="border-b border-border px-6 py-4">
            <DialogTitle>캡처 미리보기</DialogTitle>
            <DialogDescription>아래 이미지를 확인한 뒤 필요하면 저장할 수 있습니다.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[calc(90vh-9rem)] overflow-auto bg-muted/30 p-4">
            {previewUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="차트 캡처 미리보기"
                className="mx-auto h-auto w-full max-w-full rounded-md border border-border shadow-sm"
              />
            )}
          </div>
          <DialogFooter className="border-t border-border px-6 py-4">
            <Button type="button" variant="outline" onClick={() => handlePreviewOpenChange(false)}>
              닫기
            </Button>
            <Button type="button" onClick={handleDownload} disabled={!previewUrl} className="gap-1.5">
              <Download className="h-4 w-4" />
              이미지 저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

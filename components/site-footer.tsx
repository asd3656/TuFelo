"use client"

export function SiteFooter() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/80 backdrop-blur">
      <div className="container mx-auto flex h-11 max-w-6xl items-center justify-between px-4">
        <span className="text-xs text-muted-foreground/90">
          © {currentYear} Dae-young Kang (Tyr). All rights reserved.
        </span>
        <span className="text-xs text-muted-foreground/90">스타크래프트 TuF CLAN</span>
      </div>
    </footer>
  )
}

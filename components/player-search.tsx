"use client"

import { useMemo, useState } from "react"
import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface PlayerSearchProps {
  label: string
  placeholder: string
  value: string
  onChange: (value: string) => void
  options?: string[]
  disabled?: boolean
}

export function PlayerSearch({ label, placeholder, value, onChange, options = [], disabled = false }: PlayerSearchProps) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  const filteredOptions = useMemo(() => {
    const q = value.trim().toLowerCase()
    if (q.length === 0) return options.slice(0, 12)
    return options
      .filter((name) => name.toLowerCase().includes(q))
      .sort((a, b) => {
        const aStarts = a.toLowerCase().startsWith(q) ? 0 : 1
        const bStarts = b.toLowerCase().startsWith(q) ? 0 : 1
        if (aStarts !== bStarts) return aStarts - bStarts
        return a.localeCompare(b, "ko")
      })
      .slice(0, 12)
  }, [options, value])

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-muted-foreground">{label}</label>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder={placeholder}
          value={value}
          disabled={disabled}
          onChange={(e) => {
            onChange(e.target.value)
            setOpen(true)
            setActiveIndex(-1)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            setTimeout(() => {
              setOpen(false)
              setActiveIndex(-1)
            }, 120)
          }}
          onKeyDown={(e) => {
            if (filteredOptions.length === 0) return
            if (e.key === "ArrowDown") {
              e.preventDefault()
              setOpen(true)
              setActiveIndex((prev) => (prev < filteredOptions.length - 1 ? prev + 1 : 0))
              return
            }
            if (e.key === "ArrowUp") {
              e.preventDefault()
              setOpen(true)
              setActiveIndex((prev) => (prev > 0 ? prev - 1 : filteredOptions.length - 1))
              return
            }
            if (e.key === "Enter" && open) {
              const idx = activeIndex
              if (idx >= 0 && idx < filteredOptions.length) {
                e.preventDefault()
                onChange(filteredOptions[idx])
                setOpen(false)
                setActiveIndex(-1)
              }
              return
            }
            if (e.key === "Escape") {
              setOpen(false)
              setActiveIndex(-1)
            }
          }}
          className={cn(
            "pl-10 bg-input border-border text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary",
            disabled && "cursor-not-allowed opacity-60",
          )}
        />
        {!disabled && open && filteredOptions.length > 0 && (
          <div className="absolute z-40 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover shadow-lg">
            <ul className="max-h-56 overflow-y-auto py-1">
              {filteredOptions.map((name, idx) => (
                <li key={name}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground",
                      activeIndex === idx && "bg-accent text-accent-foreground",
                    )}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      onChange(name)
                      setOpen(false)
                      setActiveIndex(-1)
                    }}
                  >
                    <span className="truncate">{name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

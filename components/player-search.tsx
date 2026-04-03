"use client"

import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"

interface PlayerSearchProps {
  label: string
  placeholder: string
  value: string
  onChange: (value: string) => void
}

export function PlayerSearch({ label, placeholder, value, onChange }: PlayerSearchProps) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-muted-foreground">{label}</label>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="pl-10 bg-input border-border text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary"
        />
      </div>
    </div>
  )
}

/** DB `decorative_badges.accent` — Tailwind 프리셋 (자유 입력 없음) */
export const DECORATIVE_BADGE_ACCENTS = [
  "amber",
  "sky",
  "emerald",
  "violet",
  "rose",
  "orange",
  "blue",
  "fuchsia",
  "cyan",
  "slate",
] as const

export type DecorativeBadgeAccent = (typeof DECORATIVE_BADGE_ACCENTS)[number]

export const DECORATIVE_BADGE_ACCENT_LABELS: Record<DecorativeBadgeAccent, string> = {
  amber: "호박",
  sky: "하늘",
  emerald: "에메랄드",
  violet: "보라",
  rose: "로즈",
  orange: "오렌지",
  blue: "파랑",
  fuchsia: "푸시아",
  cyan: "시안",
  slate: "슬레이트",
}

export const DECORATIVE_BADGE_ACCENT_OPTIONS: { value: DecorativeBadgeAccent; label: string }[] =
  DECORATIVE_BADGE_ACCENTS.map((value) => ({
    value,
    label: DECORATIVE_BADGE_ACCENT_LABELS[value],
  }))

export function normalizeDecorativeBadgeAccent(raw: string | null | undefined): DecorativeBadgeAccent {
  if (raw && (DECORATIVE_BADGE_ACCENTS as readonly string[]).includes(raw)) {
    return raw as DecorativeBadgeAccent
  }
  return "amber"
}

const AMBER_BADGE_CLASSES =
  "border-amber-500/55 bg-amber-500/12 px-1.5 py-0 text-[11px] font-bold text-amber-950 dark:border-amber-400/50 dark:bg-amber-500/15 dark:text-amber-200"

/** 데이터센터·제작자 미리보기용 `Badge` 클래스 */
export function decorativeBadgeAccentClasses(accent: DecorativeBadgeAccent): string {
  switch (accent) {
    case "amber":
      return AMBER_BADGE_CLASSES
    case "sky":
      return "border-sky-500/55 bg-sky-500/12 px-1.5 py-0 text-[11px] font-bold text-sky-950 dark:border-sky-400/50 dark:bg-sky-500/15 dark:text-sky-200"
    case "emerald":
      return "border-emerald-500/55 bg-emerald-500/12 px-1.5 py-0 text-[11px] font-bold text-emerald-950 dark:border-emerald-400/50 dark:bg-emerald-500/15 dark:text-emerald-200"
    case "violet":
      return "border-violet-500/55 bg-violet-500/12 px-1.5 py-0 text-[11px] font-bold text-violet-950 dark:border-violet-400/50 dark:bg-violet-500/15 dark:text-violet-200"
    case "rose":
      return "border-rose-500/55 bg-rose-500/12 px-1.5 py-0 text-[11px] font-bold text-rose-950 dark:border-rose-400/50 dark:bg-rose-500/15 dark:text-rose-200"
    case "orange":
      return "border-orange-500/55 bg-orange-500/12 px-1.5 py-0 text-[11px] font-bold text-orange-950 dark:border-orange-400/50 dark:bg-orange-500/15 dark:text-orange-200"
    case "blue":
      return "border-blue-500/55 bg-blue-500/12 px-1.5 py-0 text-[11px] font-bold text-blue-950 dark:border-blue-400/50 dark:bg-blue-500/15 dark:text-blue-200"
    case "fuchsia":
      return "border-fuchsia-500/55 bg-fuchsia-500/12 px-1.5 py-0 text-[11px] font-bold text-fuchsia-950 dark:border-fuchsia-400/50 dark:bg-fuchsia-500/15 dark:text-fuchsia-200"
    case "cyan":
      return "border-cyan-500/55 bg-cyan-500/12 px-1.5 py-0 text-[11px] font-bold text-cyan-950 dark:border-cyan-400/50 dark:bg-cyan-500/15 dark:text-cyan-200"
    case "slate":
      return "border-slate-500/55 bg-slate-500/12 px-1.5 py-0 text-[11px] font-bold text-slate-900 dark:border-slate-400/50 dark:bg-slate-500/15 dark:text-slate-200"
    default:
      return AMBER_BADGE_CLASSES
  }
}

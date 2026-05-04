/** 공지사항 타입 — 실제 문구는 DB(`site_notice`)만 진실 공급원. 코드에 장문 기본값 없음 */

export type SiteNoticeItemSize = "sm" | "base" | "lg"

export interface SiteNoticeItem {
  /** 줄 하나. 일부만 진하게: **강조** 문법 */
  text: string
  /** 줄 전체 글자 크기 */
  size?: SiteNoticeItemSize
}

export interface SiteNoticeData {
  title: string
  items: SiteNoticeItem[]
}

/** 테이블 미생성·조회 실패·항목 없음 시 UI 폴백 (본문 없음, 마이그레이션 시드와 중복되지 않음) */
export const EMPTY_SITE_NOTICE: SiteNoticeData = {
  title: "공지사항",
  items: [],
}

const SIZE_CLASS: Record<SiteNoticeItemSize, string> = {
  sm: "text-sm",
  base: "text-base",
  lg: "text-lg",
}

export function siteNoticeItemSizeClass(size: SiteNoticeItemSize | undefined): string {
  return SIZE_CLASS[size ?? "sm"] ?? "text-sm"
}

export function isValidSiteNoticeItemSize(s: string): s is SiteNoticeItemSize {
  return s === "sm" || s === "base" || s === "lg"
}

import { toPng } from "html-to-image"

type StyleSnapshot = {
  el: HTMLElement
  overflow: string
  overflowX: string
  overflowY: string
  width: string
  maxWidth: string
  minWidth: string
}

function snapshotStyle(el: HTMLElement): StyleSnapshot {
  return {
    el,
    overflow: el.style.overflow,
    overflowX: el.style.overflowX,
    overflowY: el.style.overflowY,
    width: el.style.width,
    maxWidth: el.style.maxWidth,
    minWidth: el.style.minWidth,
  }
}

function restoreStyle(snapshot: StyleSnapshot) {
  const { el, ...styles } = snapshot
  Object.assign(el.style, styles)
}

/** 캡처 직전 overflow·너비 제한을 풀어 가로 스크롤 영역 전체가 보이게 합니다. */
export function beginFullContentCapture(root: HTMLElement): () => void {
  const snapshots: StyleSnapshot[] = []

  const apply = (el: HTMLElement, updates: Partial<CSSStyleDeclaration>) => {
    snapshots.push(snapshotStyle(el))
    Object.assign(el.style, updates)
  }

  let parent: HTMLElement | null = root.parentElement
  while (parent && parent !== document.body) {
    const computed = getComputedStyle(parent)
    const needsOverflowFix =
      computed.overflow !== "visible" ||
      computed.overflowX !== "visible" ||
      computed.overflowY !== "visible"
    const needsWidthFix = computed.maxWidth !== "none" && computed.maxWidth !== ""

    if (needsOverflowFix || needsWidthFix) {
      apply(parent, {
        ...(needsOverflowFix
          ? { overflow: "visible", overflowX: "visible", overflowY: "visible" }
          : {}),
        ...(needsWidthFix ? { maxWidth: "none" } : {}),
      })
    }
    parent = parent.parentElement
  }

  const scrollables = root.querySelectorAll<HTMLElement>(
    '[data-slot="table-container"], .overflow-x-auto',
  )
  scrollables.forEach((el) => {
    const contentWidth = Math.max(el.scrollWidth, el.clientWidth)
    apply(el, {
      overflow: "visible",
      overflowX: "visible",
      width: `${contentWidth}px`,
      maxWidth: "none",
    })

    const table = el.querySelector("table")
    if (table instanceof HTMLElement) {
      const tableWidth = Math.max(table.scrollWidth, contentWidth)
      apply(table, {
        width: `${tableWidth}px`,
        minWidth: `${tableWidth}px`,
      })
    }
  })

  apply(root, {
    overflow: "visible",
    overflowX: "visible",
    overflowY: "visible",
    maxWidth: "none",
  })

  return () => {
    for (let i = snapshots.length - 1; i >= 0; i--) {
      restoreStyle(snapshots[i])
    }
  }
}

function waitForLayout() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
}

export async function captureElementToPng(
  node: HTMLElement,
  options: {
    pixelRatio?: number
    backgroundColor?: string
    fullContent?: boolean
  } = {},
): Promise<string> {
  const restore = options.fullContent ? beginFullContentCapture(node) : null
  let restoreRootWidth: (() => void) | null = null

  void node.offsetHeight
  await waitForLayout()

  if (options.fullContent) {
    const rootSnapshot = snapshotStyle(node)
    node.style.width = `${node.scrollWidth}px`
    node.style.maxWidth = "none"
    restoreRootWidth = () => restoreStyle(rootSnapshot)
    void node.offsetHeight
    await waitForLayout()
  }

  try {
    const surfaceEl = node.firstElementChild as HTMLElement | null
    const backgroundColor =
      options.backgroundColor ??
      (surfaceEl
        ? getComputedStyle(surfaceEl).backgroundColor
        : getComputedStyle(document.documentElement).backgroundColor)

    return await toPng(node, {
      cacheBust: true,
      pixelRatio: options.pixelRatio ?? 2,
      width: node.scrollWidth,
      height: node.scrollHeight,
      backgroundColor,
    })
  } finally {
    restoreRootWidth?.()
    restore?.()
  }
}

// Local rewrite 001. See rewrites/specs/001-markdown-file-preview.md.

const EXTENSIONS = new Set(["md", "markdown", "mdx", "mdc"])

// Markdown mounts every block into the DOM. The pierre viewer swaps to a virtualized
// renderer above VIRTUALIZE_BYTES (500_000) in session-ui/src/components/file.tsx, but
// Markdown has no equivalent, so guard well below that: parsing plus per-block shiki
// highlighting costs more per byte than pierre's line rendering.
export const MAX_BYTES = 100_000

const encoder = new TextEncoder()

export function isMarkdownPath(path: string | undefined) {
  if (!path) return false
  const extension = path.split(".").pop()
  if (!extension || extension === path) return false
  return EXTENSIONS.has(extension.toLowerCase())
}

export function exceedsPreviewLimit(text: string) {
  return encoder.encode(text).length > MAX_BYTES
}

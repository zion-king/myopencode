// Which tool-call inputs name a single file that can be opened directly. Used to decide
// whether a card's filename becomes a click target (rewrites/specs/003-clickable-file-cards.md).
const OPENABLE_TOOLS = new Set(["read", "edit", "write"])

export function openableFilePath(tool: string, input: Record<string, unknown>): string | undefined {
  if (!OPENABLE_TOOLS.has(tool)) return undefined
  const path = input.filePath
  if (typeof path !== "string" || path === "") return undefined
  return path
}

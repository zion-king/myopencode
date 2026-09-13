import { createContext, useContext, type JSX } from "solid-js"

// Optional: unlike `createSimpleContext` (@opencode-ai/ui/context/helper), `.use()` here
// never throws when no provider is mounted, so cards can render outside the session page
// (Storybook, read-only views) without this affordance (rewrites/specs/003-clickable-file-cards.md, R4).
export type FileOpenFn = (path: string) => void

const FileOpenContext = createContext<FileOpenFn>()

export function FileOpenProvider(props: { onOpen: FileOpenFn; children: JSX.Element }) {
  return <FileOpenContext.Provider value={props.onOpen}>{props.children}</FileOpenContext.Provider>
}

export function useFileOpenOptional(): FileOpenFn | undefined {
  return useContext(FileOpenContext)
}

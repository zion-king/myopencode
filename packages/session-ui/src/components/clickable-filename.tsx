import type { JSX } from "solid-js"
import { useFileOpenOptional } from "../context"

// Renders the same `message-part-title-filename` slot the `edit`/`write` cards already use,
// as a single element so their flex/ellipsis CSS (message-part.css) keeps matching, and
// makes it clickable when an open-file handler is available (rewrites/specs/003-clickable-file-cards.md).
export function ClickableFilename(props: { path: string | undefined; children: JSX.Element }) {
  const onOpen = useFileOpenOptional()
  const clickable = () => !!onOpen && !!props.path
  return (
    <span
      data-slot="message-part-title-filename"
      classList={{ clickable: clickable() }}
      onClick={clickable() ? () => onOpen!(props.path!) : undefined}
    >
      {props.children}
    </span>
  )
}

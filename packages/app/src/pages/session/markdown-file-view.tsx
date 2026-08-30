import { createMemo, Show, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { Markdown } from "@opencode-ai/session-ui/markdown"
import { useLanguage } from "@/context/language"
import { exceedsPreviewLimit, isMarkdownPath } from "@/pages/session/markdown-file-view-policy"

// Local rewrite 001. See rewrites/specs/001-markdown-file-preview.md.

type Mode = "preview" | "source"

// Module level so a tab keeps its mode across remounts and tab switches.
const [modes, setModes] = createStore<Record<string, Mode>>({})

export function MarkdownAwareFileView(props: {
  tab: string
  path: string | undefined
  text: string
  cacheKey: string | undefined
  fallback: () => JSX.Element
}) {
  const language = useLanguage()
  const markdown = createMemo(() => isMarkdownPath(props.path))
  const oversized = createMemo(() => exceedsPreviewLimit(props.text))
  const preview = createMemo(() => (modes[props.tab] ?? "preview") === "preview" && !oversized())

  return (
    <Show when={markdown()} fallback={props.fallback()}>
      <div>
        <div class="sticky top-0 z-10 h-10 flex items-center gap-2 px-2 border-b border-border-weaker-base bg-v2-background-bg-base">
          <Show
            when={!oversized()}
            fallback={
              <span class="text-14-regular text-text-weak truncate">
                {language.t("session.files.markdown.tooLarge")}
              </span>
            }
          >
            <button
              type="button"
              class="px-2 py-1 rounded-md bg-surface-base text-14-regular text-text-weak"
              onClick={() => setModes(props.tab, preview() ? "source" : "preview")}
            >
              {preview() ? language.t("session.files.markdown.source") : language.t("session.files.markdown.preview")}
            </button>
          </Show>
        </div>
        <Show when={preview()} fallback={props.fallback()}>
          <div class="px-6 py-4 pb-40 select-text">
            <Markdown text={props.text} cacheKey={props.cacheKey} />
          </div>
        </Show>
      </div>
    </Show>
  )
}

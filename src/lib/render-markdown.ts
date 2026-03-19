/** Parse markdown and sanitize HTML for safe insertion into the DOM. */
export async function renderMarkdownToSafeHtml(markdown: string): Promise<string> {
  const [{ marked }, { default: DOMPurify }] = await Promise.all([import('marked'), import('dompurify')])
  marked.setOptions({ breaks: true })
  const raw = marked.parse(markdown) as string
  return DOMPurify.sanitize(raw, {
    USE_PROFILES: { html: true },
  })
}

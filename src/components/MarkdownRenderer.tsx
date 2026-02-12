import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '../utils/cn'

interface MarkdownRendererProps {
  content: string
  className?: string
}

export default function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  // Clean up potential JSON artifacts if they accidentally leaked into the view
  // (Though MessageBubble handles most cases, this is double safety)
  const cleanContent = content
    .replace(/^```json\s*/i, '') // Remove opening block
    .replace(/^```\s*/i, '')     // Remove generic opening block
    .replace(/```\s*$/, '')      // Remove closing block
    .replace(/\\n/g, '\n')       // Fix escaped newlines if any
    .trim()

  return (
    <div className={cn("text-sm leading-relaxed break-words space-y-2", className)}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          // FORCE style specific elements
          h1: ({ node, ...props }) => <h1 className="text-xl font-bold mt-4 mb-2 text-neutral-900 dark:text-white" {...props} />,
          h2: ({ node, ...props }) => <h2 className="text-lg font-bold mt-3 mb-2 text-neutral-900 dark:text-white" {...props} />,
          h3: ({ node, ...props }) => <h3 className="text-base font-bold mt-3 mb-1 text-neutral-800 dark:text-zinc-100 uppercase tracking-wide" {...props} />, // Target the "### Tóm tắt"
          p: ({ node, ...props }) => <p className="mb-2 text-neutral-700 dark:text-zinc-300" {...props} />,
          ul: ({ node, ...props }) => <ul className="list-disc pl-5 space-y-1 mb-2 text-neutral-700 dark:text-zinc-300" {...props} />,
          ol: ({ node, ...props }) => <ol className="list-decimal pl-5 space-y-1 mb-2 text-neutral-700 dark:text-zinc-300" {...props} />,
          li: ({ node, ...props }) => <li className="pl-1" {...props} />,
          strong: ({ node, ...props }) => <strong className="font-bold text-neutral-900 dark:text-white" {...props} />,
          a: ({ node, ...props }) => <a className="text-blue-500 dark:text-blue-400 hover:underline underline-offset-4" target="_blank" rel="noopener noreferrer" {...props} />,
          blockquote: ({ node, ...props }) => <blockquote className="border-l-4 border-neutral-300 dark:border-zinc-600 pl-4 italic text-neutral-500 dark:text-zinc-400 my-2" {...props} />,
          code: ({ node, ...props }) => <code className="bg-neutral-200 dark:bg-zinc-800 px-1 py-0.5 rounded text-xs font-mono text-neutral-800 dark:text-zinc-200" {...props} />,
        }}
      >
        {cleanContent}
      </Markdown>
    </div>
  )
}

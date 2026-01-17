import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

interface ToolCall {
  id: string
  name: string
  status: 'pending' | 'executing' | 'completed' | 'error'
  arguments?: Record<string, unknown>
  result?: unknown
  timestamp: number
}

type TranscriptItem =
  | (Message & { type: 'message' })
  | (ToolCall & { type: 'tool' })

interface TranscriptCyclerProps {
  messages: Message[]
  toolCalls: ToolCall[]
  maxVisible?: number
}

export function TranscriptCycler({
  messages,
  toolCalls,
  maxVisible = 2
}: TranscriptCyclerProps) {
  const [visibleItems, setVisibleItems] = useState<TranscriptItem[]>([])

  // Combine and sort messages and tool calls by timestamp (newest first for cycling)
  useEffect(() => {
    console.log('[TranscriptCycler] Messages received:', messages.length, messages)
    console.log('[TranscriptCycler] ToolCalls received:', toolCalls.length)

    const combined: TranscriptItem[] = [
      ...messages.map(m => ({ ...m, type: 'message' as const })),
      ...toolCalls.map(t => ({ ...t, type: 'tool' as const }))
    ].sort((a, b) => b.timestamp - a.timestamp) // newest first

    // Only show the most recent items
    const visible = combined.slice(0, maxVisible)
    console.log('[TranscriptCycler] Visible items:', visible.length, visible)
    setVisibleItems(visible)
  }, [messages, toolCalls, maxVisible])

  // Always render container to prevent layout shift
  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Glassmorphic container - LARGER for more transcript context */}
      <div
        className="
          relative overflow-hidden
          rounded-2xl
          bg-gradient-to-br from-gray-900/90 to-gray-800/85
          backdrop-blur-md
          border border-gray-700/50
          shadow-[0_8px_32px_rgba(0,0,0,0.25)]
          px-5 py-3
        "
        style={{ height: '280px' }}
      >
        {/* Content area with vertical spacing - fixed height container */}
        <div className="space-y-3 h-full overflow-hidden">
          <AnimatePresence mode="sync" initial={false}>
            {visibleItems.map((item, index) => (
              <motion.div
                key={item.id}
                initial={{
                  opacity: 0,
                  filter: 'blur(4px)'
                }}
                animate={{
                  opacity: 1 - index * 0.3, // Fade older items more
                  filter: 'blur(0px)'
                }}
                exit={{
                  opacity: 0,
                  filter: 'blur(4px)'
                }}
                transition={{
                  duration: 0.3,
                  ease: 'easeOut'
                }}
              >
                {item.type === 'message' ? (
                  <MessageTranscript message={item as Message} />
                ) : (
                  <ToolTranscript toolCall={item as ToolCall} />
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Gradient overlay for top fade effect */}
        <div
          className="
            absolute inset-x-0 top-0 h-8
            bg-gradient-to-b from-gray-900/40 to-transparent
            pointer-events-none
          "
        />
      </div>
    </div>
  )
}

function MessageTranscript({ message }: { message: Message }) {
  const isUser = message.role === 'user'

  // Show more content - truncate at 250 chars for larger container
  const truncatedContent = message.content.length > 250
    ? message.content.slice(0, 250) + '...'
    : message.content

  return (
    <div className="flex items-start gap-2">
      {/* Role indicator */}
      <div
        className={`
          flex-shrink-0 w-1.5 h-1.5 rounded-full mt-1
          ${isUser
            ? 'bg-gradient-to-br from-[#4EEAAA] to-[#22C55E]'
            : 'bg-white/80'
          }
        `}
      />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p
          className={`
            text-xs leading-relaxed
            ${isUser
              ? 'bg-gradient-to-r from-[#4EEAAA] to-[#22C55E] bg-clip-text text-transparent'
              : 'text-white/80'
            }
          `}
        >
          {truncatedContent}
        </p>
      </div>

      {/* Role label */}
      <span className="text-[9px] text-white/30 uppercase tracking-wider flex-shrink-0">
        {message.role}
      </span>
    </div>
  )
}

function ToolTranscript({ toolCall }: { toolCall: ToolCall }) {
  // Status configuration matching MessageFeed colors
  const statusConfig = {
    pending: {
      icon: '○',
      color: 'text-[#F5A623]',
      dotColor: 'bg-[#F5A623]'
    },
    executing: {
      icon: '◐',
      color: 'text-[#22D3EE]',
      dotColor: 'bg-[#22D3EE]'
    },
    completed: {
      icon: '●',
      color: 'text-[#4EEAAA]',
      dotColor: 'bg-[#4EEAAA]'
    },
    error: {
      icon: '✕',
      color: 'text-[#EF4444]',
      dotColor: 'bg-[#EF4444]'
    }
  }

  const config = statusConfig[toolCall.status]

  // Format tool name for display (truncate if needed)
  const displayName = toolCall.name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase())

  const truncatedName = displayName.length > 35
    ? displayName.slice(0, 35) + '...'
    : displayName

  return (
    <div className="flex items-start gap-2">
      {/* Status indicator dot */}
      <div
        className={`
          flex-shrink-0 w-1.5 h-1.5 rounded-full mt-1
          ${config.dotColor}
          ${toolCall.status === 'executing' ? 'animate-pulse' : ''}
        `}
      />

      {/* Tool name */}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-white/80 leading-relaxed">
          {truncatedName}
        </p>
      </div>

      {/* Status icon */}
      <span
        className={`
          text-xs ${config.color} flex-shrink-0
          ${toolCall.status === 'executing' ? 'animate-spin' : ''}
        `}
      >
        {config.icon}
      </span>

      {/* Tool label */}
      <span className="text-[9px] text-white/30 uppercase tracking-wider flex-shrink-0">
        Tool
      </span>
    </div>
  )
}

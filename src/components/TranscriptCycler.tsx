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
    const combined: TranscriptItem[] = [
      ...messages.map(m => ({ ...m, type: 'message' as const })),
      ...toolCalls.map(t => ({ ...t, type: 'tool' as const }))
    ].sort((a, b) => b.timestamp - a.timestamp) // newest first

    // Only show the most recent items
    setVisibleItems(combined.slice(0, maxVisible))
  }, [messages, toolCalls, maxVisible])

  if (visibleItems.length === 0) {
    return null
  }

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Glassmorphic container */}
      <div
        className="
          relative overflow-hidden
          rounded-2xl
          bg-gradient-to-br from-white/5 to-white/[0.02]
          backdrop-blur-md
          border border-white/10
          shadow-[0_8px_32px_rgba(0,0,0,0.12)]
          px-6 py-4
        "
      >
        {/* Content area with vertical spacing */}
        <div className="space-y-3 min-h-[60px]">
          <AnimatePresence mode="popLayout" initial={false}>
            {visibleItems.map((item, index) => (
              <motion.div
                key={item.id}
                layout
                initial={{
                  opacity: 0,
                  y: 20,
                  filter: 'blur(8px)'
                }}
                animate={{
                  opacity: 1 - index * 0.4, // Fade older items more
                  y: 0,
                  filter: 'blur(0px)',
                  scale: 1 - index * 0.03 // Slight scale reduction
                }}
                exit={{
                  opacity: 0,
                  y: -20,
                  filter: 'blur(8px)',
                  transition: {
                    duration: 0.4,
                    ease: [0.4, 0, 0.6, 1]
                  }
                }}
                transition={{
                  duration: 0.6,
                  ease: [0.4, 0, 0.2, 1],
                  layout: {
                    duration: 0.5,
                    ease: [0.4, 0, 0.2, 1]
                  }
                }}
                className="origin-center"
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
            bg-gradient-to-b from-black/10 to-transparent
            pointer-events-none
          "
        />
      </div>
    </div>
  )
}

function MessageTranscript({ message }: { message: Message }) {
  const isUser = message.role === 'user'

  // Truncate content to ~50 chars
  const truncatedContent = message.content.length > 50
    ? message.content.slice(0, 50) + '...'
    : message.content

  return (
    <div className="flex items-center gap-2.5">
      {/* Role indicator */}
      <div
        className={`
          flex-shrink-0 w-1.5 h-1.5 rounded-full
          ${isUser
            ? 'bg-gradient-to-br from-[#4EEAAA] to-[#22C55E]'
            : 'bg-white/80'
          }
          shadow-sm
        `}
      />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p
          className={`
            text-sm font-medium truncate
            ${isUser
              ? 'bg-gradient-to-r from-[#4EEAAA] to-[#22C55E] bg-clip-text text-transparent'
              : 'text-white/90'
            }
          `}
        >
          {truncatedContent}
        </p>
      </div>

      {/* Role label */}
      <span className="text-xs text-white/40 uppercase tracking-wider flex-shrink-0">
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
    <div className="flex items-center gap-2.5">
      {/* Status indicator dot */}
      <div
        className={`
          flex-shrink-0 w-1.5 h-1.5 rounded-full
          ${config.dotColor}
          shadow-sm
          ${toolCall.status === 'executing' ? 'animate-pulse' : ''}
        `}
      />

      {/* Tool name with gradient */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white/90 truncate">
          {truncatedName}
        </p>
      </div>

      {/* Status icon */}
      <span
        className={`
          text-sm ${config.color} flex-shrink-0
          ${toolCall.status === 'executing' ? 'animate-spin' : ''}
        `}
      >
        {config.icon}
      </span>

      {/* Tool label */}
      <span className="text-xs text-white/40 uppercase tracking-wider flex-shrink-0">
        Tool
      </span>
    </div>
  )
}

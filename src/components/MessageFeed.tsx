import { useRef, useEffect, useState } from 'react'
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

interface MessageFeedProps {
  messages: Message[]
  toolCalls: ToolCall[]
  maxVisible?: number
}

export function MessageFeed({
  messages,
  toolCalls,
  maxVisible = 3
}: MessageFeedProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [visibleItems, setVisibleItems] = useState<(Message | ToolCall)[]>([])

  // Combine and sort messages and tool calls by timestamp
  useEffect(() => {
    const combined = [
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
    <div
      ref={containerRef}
      className="w-full max-w-lg mx-auto space-y-3"
    >
      <AnimatePresence mode="popLayout">
        {visibleItems.map((item, index) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 20, filter: 'blur(10px)' }}
            animate={{
              opacity: 1 - index * 0.25, // Fade out older items
              y: 0,
              filter: 'blur(0px)',
              scale: 1 - index * 0.02
            }}
            exit={{ opacity: 0, y: -20, filter: 'blur(10px)' }}
            transition={{
              duration: 0.5,
              ease: [0.4, 0, 0.2, 1]
            }}
            className="origin-center"
          >
            {'content' in item ? (
              <MessageBubble message={item as Message} />
            ) : (
              <ToolCallBubble toolCall={item as unknown as ToolCall} />
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`
          max-w-[85%] px-4 py-3 rounded-2xl
          ${isUser
            ? 'bg-gradient-to-br from-[#4EEAAA] to-[#22C55E] text-[#1A1A1A]'
            : 'bg-white/80 backdrop-blur-sm border border-gray-200/50 text-gray-800'
          }
          shadow-sm
        `}
      >
        <p className="text-sm leading-relaxed">{message.content}</p>
      </div>
    </div>
  )
}

function ToolCallBubble({ toolCall }: { toolCall: ToolCall }) {
  // SYNRG brand colors for tool call status
  const statusConfig = {
    pending: {
      icon: '○',
      color: 'text-[#F5A623]',
      bg: 'bg-[#F5A623]/10',
      border: 'border-[#F5A623]/30',
      label: 'Pending'
    },
    executing: {
      icon: '◐',
      color: 'text-[#22D3EE]',
      bg: 'bg-[#22D3EE]/10',
      border: 'border-[#22D3EE]/30',
      label: 'Executing'
    },
    completed: {
      icon: '●',
      color: 'text-[#4EEAAA]',
      bg: 'bg-[#4EEAAA]/10',
      border: 'border-[#4EEAAA]/30',
      label: 'Completed'
    },
    error: {
      icon: '✕',
      color: 'text-[#EF4444]',
      bg: 'bg-[#EF4444]/10',
      border: 'border-[#EF4444]/30',
      label: 'Error'
    }
  }

  const config = statusConfig[toolCall.status]

  // Format tool name for display
  const displayName = toolCall.name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase())

  return (
    <div className="flex justify-center">
      <div
        className={`
          inline-flex items-center gap-3 px-4 py-2.5 rounded-xl
          ${config.bg} border ${config.border}
          backdrop-blur-sm shadow-sm
        `}
      >
        {/* Status indicator */}
        <span
          className={`
            ${config.color} text-lg
            ${toolCall.status === 'executing' ? 'animate-spin' : ''}
          `}
        >
          {config.icon}
        </span>

        {/* Tool info */}
        <div className="flex flex-col">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Tool Call
          </span>
          <span className="text-sm font-medium text-gray-800">
            {displayName}
          </span>
        </div>

        {/* Status badge */}
        <span
          className={`
            text-xs font-medium px-2 py-0.5 rounded-full
            ${config.bg} ${config.color}
          `}
        >
          {config.label}
        </span>
      </div>
    </div>
  )
}

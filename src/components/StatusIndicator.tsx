import { motion } from 'framer-motion'

type AudioStatus = 'waiting' | 'connecting' | 'playing' | 'error'

interface StatusIndicatorProps {
  isConnected: boolean
  isConnecting: boolean
  agentConnected?: boolean
  audioStatus?: AudioStatus
  error?: string | null
}

export function StatusIndicator({
  isConnected,
  isConnecting,
  agentConnected,
  audioStatus,
  error
}: StatusIndicatorProps) {
  const getConnectionStatus = () => {
    if (error) return { label: 'Error', color: 'bg-[#EF4444]', pulse: false }
    if (isConnecting) return { label: 'Connecting', color: 'bg-[#F5A623]', pulse: true }
    if (isConnected && agentConnected) return { label: 'Agent Ready', color: 'bg-[#4EEAAA]', pulse: false }
    if (isConnected) return { label: 'Waiting for agent...', color: 'bg-[#22D3EE]', pulse: true }
    return { label: 'Disconnected', color: 'bg-gray-400', pulse: false }
  }

  const getAudioStatus = () => {
    switch (audioStatus) {
      case 'playing': return { label: 'Audio: Playing', color: 'bg-[#4EEAAA]', pulse: false }
      case 'connecting': return { label: 'Audio: Connecting', color: 'bg-[#F5A623]', pulse: true }
      case 'error': return { label: 'Audio: Error', color: 'bg-[#EF4444]', pulse: false }
      default: return { label: 'Audio: Waiting', color: 'bg-gray-400', pulse: false }
    }
  }

  const connectionStatus = getConnectionStatus()
  const audio = getAudioStatus()

  return (
    <div className="flex flex-col gap-2">
      {/* Connection status */}
      <div className="flex items-center gap-2">
        <div className="relative">
          <motion.div
            className={`w-2.5 h-2.5 rounded-full ${connectionStatus.color}`}
            animate={connectionStatus.pulse ? { scale: [1, 1.2, 1] } : {}}
            transition={connectionStatus.pulse ? { duration: 1, repeat: Infinity } : {}}
          />
          {connectionStatus.pulse && (
            <motion.div
              className={`absolute inset-0 w-2.5 h-2.5 rounded-full ${connectionStatus.color}`}
              animate={{ scale: [1, 2], opacity: [0.5, 0] }}
              transition={{ duration: 1, repeat: Infinity }}
            />
          )}
        </div>
        <span className="text-xs font-medium text-gray-500">
          {connectionStatus.label}
        </span>
      </div>

      {/* Audio status - only show when connected */}
      {isConnected && (
        <div className="flex items-center gap-2">
          <div className="relative">
            <motion.div
              className={`w-2.5 h-2.5 rounded-full ${audio.color}`}
              animate={audio.pulse ? { scale: [1, 1.2, 1] } : {}}
              transition={audio.pulse ? { duration: 1, repeat: Infinity } : {}}
            />
            {audio.pulse && (
              <motion.div
                className={`absolute inset-0 w-2.5 h-2.5 rounded-full ${audio.color}`}
                animate={{ scale: [1, 2], opacity: [0.5, 0] }}
                transition={{ duration: 1, repeat: Infinity }}
              />
            )}
          </div>
          <span className="text-xs font-medium text-gray-500">
            {audio.label}
          </span>
        </div>
      )}
    </div>
  )
}

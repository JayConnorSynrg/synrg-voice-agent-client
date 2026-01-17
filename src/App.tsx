import { useEffect, useRef, useState } from 'react'
import { WebGLOrb } from './components/WebGLOrb'
import { LiveWaveform } from './components/LiveWaveform'
import { TranscriptCycler } from './components/TranscriptCycler'
import { useLiveKitAgent } from './hooks/useLiveKitAgent'
import { useStore } from './lib/store'

// Extend Window interface for global readiness state
declare global {
  interface Window {
    voiceAgentReady: boolean
    voiceAgentStatus: {
      ready: boolean
      connected: boolean
      agentConnected: boolean
      audioReady: boolean
      error: string | null
      timestamp: number
    }
  }
}

// Mock data for local UI development
const MOCK_MESSAGES = [
  { id: 'msg-1', role: 'user' as const, content: 'Can you send an email to John about the meeting?', timestamp: Date.now() - 5000 },
  { id: 'msg-2', role: 'assistant' as const, content: 'I\'ll send that email to John right away.', timestamp: Date.now() - 3000 },
  { id: 'msg-3', role: 'user' as const, content: 'Also check the database for Q3 revenue.', timestamp: Date.now() - 1000 },
]

const MOCK_TOOL_CALLS = [
  { id: 'tc-1', name: 'send_email', status: 'completed' as const, timestamp: Date.now() - 4000 },
  { id: 'tc-2', name: 'query_database', status: 'executing' as const, timestamp: Date.now() - 500 },
]

function App() {
  // Get URL parameters for LiveKit connection
  //   - livekit_url: LiveKit server URL (wss://...)
  //   - token: LiveKit room token (JWT)
  //   - mock: Enable mock mode for UI development
  const params = new URLSearchParams(window.location.search)
  const livekitUrl = params.get('livekit_url') || params.get('livekit')
  const livekitToken = params.get('token') || params.get('livekit_token')
  const mockMode = params.get('mock') === 'true'
  const hasConnectionParams = !!(livekitUrl && livekitToken) || mockMode

  // Track if we've signaled readiness
  const readinessSignaled = useRef(false)

  // Mock mode state cycling
  const [mockAgentState, setMockAgentState] = useState<'listening' | 'thinking' | 'speaking' | null>('speaking')
  const [mockVolume, setMockVolume] = useState(0.5)

  // Initialize LiveKit agent hook
  const agent = useLiveKitAgent()

  const {
    agentState,
    agentConnected,
    audioStatus,
    inputVolume,
    outputVolume,
    messages,
    toolCalls
  } = useStore()

  // Mock mode: cycle through states and animate volume
  useEffect(() => {
    if (!mockMode) return

    // Cycle agent states every 3 seconds
    const stateInterval = setInterval(() => {
      setMockAgentState(prev => {
        if (prev === 'listening') return 'thinking'
        if (prev === 'thinking') return 'speaking'
        if (prev === 'speaking') return 'listening'
        return 'listening'
      })
    }, 3000)

    // Animate volume smoothly
    const volumeInterval = setInterval(() => {
      setMockVolume(Math.random() * 0.7 + 0.3) // 0.3 - 1.0
    }, 100)

    return () => {
      clearInterval(stateInterval)
      clearInterval(volumeInterval)
    }
  }, [mockMode])

  // Connect to LiveKit when parameters are available
  useEffect(() => {
    if (mockMode) return // Skip in mock mode
    if (livekitUrl && livekitToken) {
      agent.connect(livekitUrl, livekitToken)
    }

    return () => {
      agent.disconnect()
    }
  }, [livekitUrl, livekitToken, mockMode])

  // Get connection status
  const { isConnected, error } = agent

  // Determine if fully ready (for Recall.ai signaling)
  const isFullyReady = isConnected && agentConnected

  // Update global readiness state for Recall.ai to check
  useEffect(() => {
    const isReady = isConnected && agentConnected && audioStatus === 'playing'

    // Update global status object (always)
    window.voiceAgentStatus = {
      ready: isReady,
      connected: isConnected,
      agentConnected: agentConnected,
      audioReady: audioStatus === 'playing',
      error: error,
      timestamp: Date.now()
    }

    // Update simple ready flag
    window.voiceAgentReady = isReady

    // Log readiness once when first achieved
    if (isReady && !readinessSignaled.current) {
      readinessSignaled.current = true
      console.log('VOICE_AGENT_READY - Page fully initialized and ready for meeting')

      // Dispatch custom event that Recall.ai can listen for
      window.dispatchEvent(new CustomEvent('voiceAgentReady', {
        detail: window.voiceAgentStatus
      }))
    }
  }, [isConnected, agentConnected, audioStatus, error])

  // ============================================================
  // RENDERING LOGIC
  // ============================================================

  // PRODUCTION: Always show full UI immediately
  // No instructions page - orb shows "Ready" until LiveKit connects

  // Use mock or real data based on mode
  const displayAgentState = mockMode ? mockAgentState : agentState
  const displayInputVolume = mockMode ? mockVolume : inputVolume
  const displayOutputVolume = mockMode ? mockVolume : outputVolume
  const displayMessages = mockMode ? MOCK_MESSAGES : messages
  const displayToolCalls = mockMode ? MOCK_TOOL_CALLS : toolCalls

  // Only pass output volume to orb when speaking (for bounce/ripple effect)
  const orbOutputVolume = displayAgentState === 'speaking' ? displayOutputVolume : 0

  // FULLY CONNECTED: Show complete UI - user sees "Ready" immediately
  // Layout: Orb → State Label → Transcript (center) → Waveform → Logo
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center overflow-hidden py-6">

      {/* Mode badge - top left */}
      <div className="absolute top-3 left-3">
        <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded-full ${mockMode ? 'bg-amber-500/20 text-amber-700' : 'bg-[#4EEAAA]/20 text-[#1A1A1A]'}`}>
          {mockMode ? 'Mock Mode' : 'AIO Live'}
        </span>
      </div>

      {/* Main content - vertical stack, all separated */}
      <div className="flex flex-col items-center gap-4 w-full max-w-2xl px-4">

        {/* The Orb - 50% smaller (280 → 140) */}
        <div style={{ height: '140px', width: '140px' }}>
          <WebGLOrb
            agentState={displayAgentState}
            inputVolume={displayInputVolume}
            outputVolume={orbOutputVolume}
            isConnected={true}
            size={140}
          />
        </div>

        {/* Agent state label - 25% smaller */}
        <div className="h-6 flex items-center justify-center">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">
            {displayAgentState === 'listening' && 'Listening...'}
            {displayAgentState === 'thinking' && 'Processing...'}
            {displayAgentState === 'speaking' && 'Speaking...'}
            {!displayAgentState && 'Ready'}
          </p>
        </div>

        {/* Transcript Cycler - CENTER, keeps flex for text */}
        <div className="w-full">
          <TranscriptCycler
            messages={displayMessages}
            toolCalls={displayToolCalls}
            maxVisible={6}
          />
        </div>

        {/* Input waveform - 25% smaller (48 → 36), below transcript */}
        <div className="w-full max-w-sm h-9">
          <div style={{ opacity: displayAgentState === 'listening' ? 1 : 0, transition: 'opacity 0.3s' }}>
            <LiveWaveform
              active={displayAgentState === 'listening'}
              barColor="rgba(78, 234, 170, 0.7)"
              height={36}
            />
          </div>
        </div>

        {/* Error display */}
        {error && !mockMode && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-xs text-red-600">{error}</p>
          </div>
        )}

        {/* SYNRG branding - 25% smaller, in flow not absolute */}
        <div className="text-center mt-2">
          <img
            src="/synrg-logo.png"
            alt="SYNRG"
            className="h-8 w-auto mx-auto"
          />
          <p className="text-[10px] text-gray-400 mt-1 tracking-wider">
            VOICE ASSISTANT
          </p>
        </div>
      </div>
    </div>
  )
}

export default App

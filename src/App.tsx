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
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center overflow-hidden">

      {/* Main content container */}
      <div className="relative z-10 w-full max-w-2xl px-6 py-8 flex flex-col items-center">

        {/* Mode badge - top left */}
        <div className="absolute top-4 left-4">
          <span className={`px-2 py-1 text-xs font-medium rounded-full ${mockMode ? 'bg-amber-500/20 text-amber-700' : 'bg-[#4EEAAA]/20 text-[#1A1A1A]'}`}>
            {mockMode ? 'Mock Mode' : 'AIO Live'}
          </span>
        </div>

        {/* Hero: WebGL Orb with Transcript below - FIXED LAYOUT */}
        <div className="flex flex-col items-center" style={{ minHeight: '500px' }}>
          {/* The Orb - fixed position, only bounces/ripples when speaking */}
          <div style={{ height: '280px', width: '280px' }}>
            <WebGLOrb
              agentState={displayAgentState}
              inputVolume={displayInputVolume}
              outputVolume={orbOutputVolume}
              isConnected={true}
              size={280}
            />
          </div>

          {/* Agent state label - fixed height */}
          <div className="h-8 flex items-center justify-center mt-4">
            <p className="text-sm font-medium text-gray-400 uppercase tracking-wider">
              {displayAgentState === 'listening' && 'Listening...'}
              {displayAgentState === 'thinking' && 'Processing...'}
              {displayAgentState === 'speaking' && 'Speaking...'}
              {!displayAgentState && 'Ready'}
            </p>
          </div>

          {/* Transcript Cycler - fixed position below orb */}
          <div className="mt-4 w-full">
            <TranscriptCycler
              messages={displayMessages}
              toolCalls={displayToolCalls}
              maxVisible={6}
            />
          </div>

          {/* Input waveform - fixed height container, opacity controlled */}
          <div className="w-full max-w-md mt-4 h-12">
            <div style={{ opacity: displayAgentState === 'listening' ? 1 : 0, transition: 'opacity 0.3s' }}>
              <LiveWaveform
                active={displayAgentState === 'listening'}
                barColor="rgba(78, 234, 170, 0.7)"
                height={48}
              />
            </div>
          </div>
        </div>

        {/* Error display */}
        {error && !mockMode && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}
      </div>

      {/* SYNRG branding - bottom */}
      <div className="absolute bottom-6 text-center">
        <img
          src="/synrg-logo.png"
          alt="SYNRG"
          className="h-10 w-auto mx-auto"
        />
        <p className="text-xs text-gray-400 mt-2 tracking-wider">
          VOICE ASSISTANT
        </p>
      </div>
    </div>
  )
}

export default App

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

  // CONNECTION-GATED RENDERING: Only show full UI when ready
  const [showUI, setShowUI] = useState(mockMode) // Immediately show UI in mock mode

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

  // Determine if fully ready
  const isFullyReady = isConnected && agentConnected

  // CONNECTION-GATED RENDERING: Reveal UI when connected + agent detected
  useEffect(() => {
    if (isFullyReady && !showUI) {
      // Small delay to ensure audio tracks are subscribed
      const timer = setTimeout(() => setShowUI(true), 300)
      return () => clearTimeout(timer)
    }
  }, [isFullyReady, showUI])

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

  // If no connection params, show instructions (development mode)
  if (!hasConnectionParams) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center overflow-hidden">
        <div className="p-6 bg-white/60 backdrop-blur-sm rounded-2xl border border-gray-200/50 max-w-md">
          <h3 className="text-lg font-semibold text-gray-800 mb-2">
            Connect to Voice Agent
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            Add URL parameters to connect via LiveKit:
          </p>
          <code className="block p-3 bg-gray-100 rounded-lg text-xs font-mono text-gray-700 break-all">
            ?livekit_url=wss://your-project.livekit.cloud&token=JWT_TOKEN
          </code>
          <p className="text-xs text-gray-500 mt-3">
            The token is generated by your backend when joining a LiveKit room.
          </p>
        </div>
      </div>
    )
  }

  // WHILE CONNECTING: Show only the orb (no text states)
  // The orb animates in a muted "connecting" visual state
  if (!showUI) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center overflow-hidden">
        <WebGLOrb
          agentState={null}
          inputVolume={0}
          outputVolume={0}
          isConnected={false}
          size={280}
        />
      </div>
    )
  }

  // Use mock or real data based on mode
  const displayAgentState = mockMode ? mockAgentState : agentState
  const displayInputVolume = mockMode ? mockVolume : inputVolume
  const displayOutputVolume = mockMode ? mockVolume : outputVolume
  const displayMessages = mockMode ? MOCK_MESSAGES : messages
  const displayToolCalls = mockMode ? MOCK_TOOL_CALLS : toolCalls

  // FULLY CONNECTED: Show complete UI - user sees "Ready" immediately
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center overflow-hidden">

      {/* Main content container */}
      <div className="relative z-10 w-full max-w-2xl px-6 py-8 flex flex-col items-center">

        {/* Mode badge - top left */}
        <div className="absolute top-4 left-4">
          <span className={`px-2 py-1 text-xs font-medium rounded-full ${mockMode ? 'bg-amber-500/20 text-amber-700' : 'bg-[#4EEAAA]/20 text-[#1A1A1A]'}`}>
            {mockMode ? 'Mock Mode' : 'LiveKit'}
          </span>
        </div>

        {/* Hero: WebGL Orb with Transcript below */}
        <div className="flex flex-col items-center justify-center py-8">
          {/* The Orb */}
          <WebGLOrb
            agentState={displayAgentState}
            inputVolume={displayInputVolume}
            outputVolume={displayOutputVolume}
            isConnected={true}
            size={280}
          />

          {/* Transcript Cycler - positioned directly below orb */}
          <div className="mt-6 w-full">
            <TranscriptCycler
              messages={displayMessages}
              toolCalls={displayToolCalls}
              maxVisible={2}
            />
          </div>
        </div>

        {/* Input waveform - shows when listening */}
        {displayAgentState === 'listening' && (
          <div className="w-full max-w-md mb-6 animate-fade-in">
            <LiveWaveform
              active={true}
              barColor="rgba(78, 234, 170, 0.7)"
              height={48}
            />
          </div>
        )}

        {/* Agent state label - NO "Connecting" states ever shown */}
        <div className="mb-6 text-center">
          <p className="text-sm font-medium text-gray-400 uppercase tracking-wider">
            {displayAgentState === 'listening' && 'Listening...'}
            {displayAgentState === 'thinking' && 'Processing...'}
            {displayAgentState === 'speaking' && 'Speaking...'}
            {!displayAgentState && 'Ready'}
          </p>
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

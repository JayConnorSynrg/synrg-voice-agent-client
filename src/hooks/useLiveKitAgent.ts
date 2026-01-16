import { useCallback, useRef, useState, useEffect } from 'react'
import { useStore } from '../lib/store'

// LiveKit client types
interface RoomOptions {
  adaptiveStream?: boolean
  dynacast?: boolean
  webAudioMix?: boolean | { audioContext: AudioContext }
  audioCaptureDefaults?: {
    echoCancellation?: boolean
    noiseSuppression?: boolean
    autoGainControl?: boolean
  }
}

interface DataReceivedCallback {
  payload: Uint8Array
  topic?: string
  participant?: unknown
}

interface UseLiveKitAgentOptions {
  onConnect?: () => void
  onDisconnect?: () => void
  onError?: (error: string) => void
}

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

interface AgentMessage {
  type: string
  [key: string]: unknown
}

// =============================================================================
// AUDIO DIAGNOSTIC SYSTEM - Global for debugging
// =============================================================================
const createAudioDiag = () => ({
  startTime: Date.now(),
  events: [] as { time: number; event: string; data?: any }[],
  log: function(event: string, data?: any) {
    const elapsed = Date.now() - this.startTime
    this.events.push({ time: elapsed, event, data })
    console.log(`[AUDIO +${elapsed}ms] ${event}`, data || '')
  },
  error: function(event: string, err: any) {
    const elapsed = Date.now() - this.startTime
    const errorInfo = err instanceof Error ? { name: err.name, message: err.message } : err
    this.events.push({ time: elapsed, event: `ERROR: ${event}`, data: errorInfo })
    console.error(`[AUDIO +${elapsed}ms] ❌ ${event}`, errorInfo)
  },
  summary: function() {
    console.log('=== AUDIO DIAGNOSTIC SUMMARY ===')
    this.events.forEach(e => console.log(`  [${e.time}ms] ${e.event}`, e.data || ''))
    console.log('=== END SUMMARY ===')
  }
})

export function useLiveKitAgent(options: UseLiveKitAgentOptions = {}) {
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected')
  const [error, setError] = useState<string | null>(null)

  const roomRef = useRef<any>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioDiagRef = useRef(createAudioDiag())

  const {
    setSessionId,
    setAgentConnected,
    setAgentState,
    setInputVolume,
    setOutputVolume,
    setAudioStatus,
    addMessage,
    addToolCall,
    updateToolCall,
    reset
  } = useStore()

  // Handle data messages from agent
  const handleDataMessage = useCallback((data: DataReceivedCallback) => {
    try {
      const decoder = new TextDecoder()
      const jsonStr = decoder.decode(data.payload)
      const message: AgentMessage = JSON.parse(jsonStr)

      switch (message.type) {
        case 'agent.state':
          setAgentState(message.state as 'listening' | 'thinking' | 'speaking' | null)
          break
        case 'agent.volume':
          setOutputVolume(message.volume as number)
          break
        case 'transcript.user':
          addMessage({ role: 'user', content: message.text as string })
          break
        case 'transcript.assistant':
          addMessage({ role: 'assistant', content: message.text as string })
          break
        case 'tool.call':
          addToolCall({
            id: message.call_id as string,
            name: message.name as string,
            status: 'pending',
            arguments: message.arguments as Record<string, unknown>
          })
          break
        case 'tool.executing':
          updateToolCall(message.call_id as string, { status: 'executing' })
          break
        case 'tool.completed':
          updateToolCall(message.call_id as string, { status: 'completed', result: message.result })
          break
        case 'tool.error':
          updateToolCall(message.call_id as string, { status: 'error', result: message.error })
          break
        case 'error':
          setError(message.message as string)
          options.onError?.(message.message as string)
          break
        default:
          console.log('Unknown message type:', message.type)
      }
    } catch (err) {
      console.error('Failed to parse data message:', err)
    }
  }, [setAgentState, setOutputVolume, addMessage, addToolCall, updateToolCall, options])

  // Connect to LiveKit room
  const connect = useCallback(
    async (livekitUrl: string, token: string) => {
      if (roomRef.current?.state === 'connected') {
        return
      }

      const audioDiag = audioDiagRef.current = createAudioDiag()
      ;(window as any).__audioDiag = audioDiag

      audioDiag.log('Connection initiated', { livekitUrl, tokenLength: token.length })
      setConnectionState('connecting')
      setError(null)

      try {
        // =================================================================
        // SIMPLIFIED APPROACH: Use LiveKit's webAudioMix for audio handling
        // This is the recommended approach per LiveKit documentation
        // =================================================================
        const { Room, RoomEvent } = await import('livekit-client')
        audioDiag.log('LiveKit SDK imported')

        // Create shared AudioContext for all audio operations
        // This context will be used by LiveKit's webAudioMix AND for input capture
        const sharedAudioContext = new AudioContext()
        audioContextRef.current = sharedAudioContext
        audioDiag.log('Shared AudioContext created', {
          state: sharedAudioContext.state,
          sampleRate: sharedAudioContext.sampleRate
        })

        // Resume if suspended (browser autoplay policy)
        if (sharedAudioContext.state === 'suspended') {
          audioDiag.log('Resuming suspended AudioContext...')
          await sharedAudioContext.resume()
        }

        // Create Room with webAudioMix enabled
        // This tells LiveKit to route all audio through our AudioContext
        // which is critical for Recall.ai's audio capture
        const room = new Room({
          adaptiveStream: true,
          dynacast: true,
          // KEY: webAudioMix routes all remote audio through AudioContext.destination
          // This is what Recall.ai captures for meeting output
          webAudioMix: {
            audioContext: sharedAudioContext
          },
          audioCaptureDefaults: {
            // Disable processing - we want raw audio
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false
          }
        } as RoomOptions)

        roomRef.current = room
        audioDiag.log('Room created with webAudioMix enabled')

        // Helper to detect voice agent
        const isVoiceAgent = (participant: any): boolean => {
          const identity = participant.identity?.toLowerCase() || ''
          const kind = participant.kind || participant.metadata?.kind
          return (
            participant.isAgent === true ||
            kind === 'agent' ||
            identity.includes('agent')
          )
        }

        // =================================================================
        // EVENT HANDLERS
        // =================================================================
        room.on(RoomEvent.Connected, () => {
          audioDiag.log('Room connected', { name: room.name, sid: room.sid })
          setConnectionState('connected')
          setSessionId(room.name || null)
          options.onConnect?.()
        })

        room.on(RoomEvent.Disconnected, () => {
          audioDiag.log('Room disconnected')
          setConnectionState('disconnected')
          options.onDisconnect?.()
        })

        room.on(RoomEvent.Reconnecting, () => {
          audioDiag.log('Room reconnecting')
          setConnectionState('reconnecting')
        })

        room.on(RoomEvent.Reconnected, () => {
          audioDiag.log('Room reconnected')
          setConnectionState('connected')
        })

        room.on(RoomEvent.DataReceived, handleDataMessage)

        room.on(RoomEvent.ParticipantConnected, (participant: any) => {
          audioDiag.log('Participant connected', {
            identity: participant.identity,
            isAgent: participant.isAgent,
            kind: participant.kind
          })
          if (isVoiceAgent(participant)) {
            audioDiag.log('Voice agent detected!')
            setAgentConnected(true)
          }
        })

        room.on(RoomEvent.ParticipantDisconnected, (participant: any) => {
          audioDiag.log('Participant disconnected', { identity: participant.identity })
          if (isVoiceAgent(participant)) {
            setAgentConnected(false)
          }
        })

        // =================================================================
        // TRACK HANDLING - Simplified with webAudioMix
        // =================================================================
        room.on(RoomEvent.TrackSubscribed, async (track: any, _pub: any, participant: any) => {
          if (track.kind === 'audio') {
            audioDiag.log('Audio track subscribed', {
              participant: participant.identity,
              trackSid: track.sid,
              source: track.source
            })
            setAudioStatus('connecting')

            try {
              // With webAudioMix enabled, just attach the track
              // LiveKit automatically routes it through AudioContext.destination
              const audioElement = track.attach() as HTMLAudioElement
              audioElement.id = `audio-${track.sid}`

              // Still add to DOM for browsers that need it
              audioElement.style.cssText = 'position:fixed;bottom:0;left:0;width:1px;height:1px;opacity:0.01;'
              document.body.appendChild(audioElement)

              // Attempt play (may be auto-handled by webAudioMix)
              try {
                await audioElement.play()
                audioDiag.log('Audio element playing', { paused: audioElement.paused })
              } catch (playErr) {
                audioDiag.log('Audio element play not needed (webAudioMix handles it)')
              }

              setAudioStatus('playing')
              audioDiag.log('Audio output configured via webAudioMix')

              // Monitor output levels
              const analyser = sharedAudioContext.createAnalyser()
              analyser.fftSize = 256
              const dataArray = new Uint8Array(analyser.frequencyBinCount)

              // Create a source from the track's media stream
              const mediaStream = new MediaStream([track.mediaStreamTrack])
              const source = sharedAudioContext.createMediaStreamSource(mediaStream)
              source.connect(analyser)
              // Note: Don't connect analyser to destination - webAudioMix already handles playback

              let outputActiveFrames = 0
              const monitorOutput = () => {
                if (track.mediaStreamTrack?.readyState !== 'live') return

                analyser.getByteFrequencyData(dataArray)
                const avg = dataArray.reduce((a, b) => a + b) / dataArray.length
                const normalized = Math.min(1, avg / 128)
                setOutputVolume(normalized)

                if (normalized > 0.01) {
                  outputActiveFrames++
                  if (outputActiveFrames === 1) {
                    audioDiag.log('OUTPUT: First audio detected', { level: normalized.toFixed(3) })
                  }
                }

                requestAnimationFrame(monitorOutput)
              }
              setTimeout(monitorOutput, 500)

            } catch (err) {
              audioDiag.error('Track subscription failed', err)
              setAudioStatus('error')
            }
          }
        })

        room.on(RoomEvent.TrackUnsubscribed, (track: any) => {
          if (track.kind === 'audio') {
            audioDiag.log('Audio track unsubscribed', { trackSid: track.sid })
            track.detach().forEach((el: HTMLElement) => el.remove())
          }
        })

        // Handle audio playback issues
        room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
          audioDiag.log('Audio playback status changed', {
            canPlaybackAudio: room.canPlaybackAudio
          })
          if (!room.canPlaybackAudio) {
            audioDiag.log('Attempting to start audio...')
            room.startAudio().catch((err: any) => {
              audioDiag.error('startAudio failed', err)
            })
          }
        })

        // =================================================================
        // CONNECT TO ROOM
        // =================================================================
        audioDiag.log('Connecting to room...')
        await room.connect(livekitUrl, token, { autoSubscribe: true })

        audioDiag.log('Connection complete', {
          localParticipant: room.localParticipant?.identity,
          remoteParticipants: room.remoteParticipants.size
        })

        // Check for existing participants
        room.remoteParticipants.forEach((participant: any) => {
          audioDiag.log('Existing participant', {
            identity: participant.identity,
            isAgent: participant.isAgent
          })
          if (isVoiceAgent(participant)) {
            setAgentConnected(true)
          }
        })

        // =================================================================
        // CAPTURE MEETING AUDIO AND PUBLISH TO LIVEKIT
        // In Recall.ai context, getUserMedia captures meeting audio
        // =================================================================
        try {
          audioDiag.log('Capturing meeting audio...')

          const { LocalAudioTrack } = await import('livekit-client')

          // Simple getUserMedia - let browser handle settings
          const meetingStream = await navigator.mediaDevices.getUserMedia({
            audio: true,  // Use defaults - Recall.ai injects meeting audio here
            video: false
          })

          const audioTrack = meetingStream.getAudioTracks()[0]
          if (!audioTrack) {
            throw new Error('No audio track from getUserMedia')
          }

          audioDiag.log('Meeting audio captured', {
            trackId: audioTrack.id,
            label: audioTrack.label,
            settings: audioTrack.getSettings()
          })

          // Create and publish LiveKit track
          // CRITICAL: userProvidedTrack must be TRUE to use our captured track
          const localAudioTrack = new LocalAudioTrack(audioTrack, undefined, true)
          await room.localParticipant.publishTrack(localAudioTrack, {
            name: 'meeting-audio',
            source: 'microphone'
          })

          audioDiag.log('Meeting audio published to LiveKit', {
            trackSid: localAudioTrack.sid
          })

          // Monitor input levels
          const inputAnalyser = sharedAudioContext.createAnalyser()
          inputAnalyser.fftSize = 256
          const inputSource = sharedAudioContext.createMediaStreamSource(meetingStream)
          inputSource.connect(inputAnalyser)

          const inputDataArray = new Uint8Array(inputAnalyser.frequencyBinCount)
          let inputActiveFrames = 0

          const monitorInput = () => {
            if (audioTrack.readyState !== 'live') {
              audioDiag.log('Input track ended')
              return
            }

            inputAnalyser.getByteFrequencyData(inputDataArray)
            const avg = inputDataArray.reduce((a, b) => a + b) / inputDataArray.length
            const normalized = Math.min(1, avg / 128)
            setInputVolume(normalized)

            if (normalized > 0.01) {
              inputActiveFrames++
              if (inputActiveFrames === 1) {
                audioDiag.log('INPUT: First audio detected', { level: normalized.toFixed(3) })
              }
            }

            requestAnimationFrame(monitorInput)
          }
          setTimeout(monitorInput, 500)

        } catch (err) {
          audioDiag.error('Meeting audio capture failed', err)

          // Fallback: enable standard microphone
          audioDiag.log('Falling back to standard microphone...')
          try {
            await room.localParticipant.setMicrophoneEnabled(true)
            audioDiag.log('Standard microphone enabled')
          } catch (micErr) {
            audioDiag.error('Microphone fallback failed', micErr)
          }
        }

      } catch (err) {
        audioDiag.error('Connection failed', err)
        audioDiag.summary()
        setConnectionState('disconnected')
        const message = err instanceof Error ? err.message : 'Connection failed'
        setError(message)
        options.onError?.(message)
      }
    },
    [setSessionId, setAgentConnected, setAudioStatus, setInputVolume, setOutputVolume, handleDataMessage, options]
  )

  // Disconnect from LiveKit room
  const disconnect = useCallback(() => {
    if (roomRef.current) {
      roomRef.current.disconnect()
      roomRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    reset()
    setConnectionState('disconnected')
  }, [reset])

  // Send data message to agent
  const sendData = useCallback((data: Record<string, unknown>) => {
    if (roomRef.current?.state === 'connected') {
      const encoder = new TextEncoder()
      const payload = encoder.encode(JSON.stringify(data))
      roomRef.current.localParticipant.publishData(payload, { reliable: true })
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect()
    }
  }, [disconnect])

  return {
    connect,
    disconnect,
    sendData,
    isConnected: connectionState === 'connected',
    isConnecting: connectionState === 'connecting',
    isReconnecting: connectionState === 'reconnecting',
    connectionState,
    error
  }
}

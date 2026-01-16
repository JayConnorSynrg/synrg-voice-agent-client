import { useCallback, useRef, useState, useEffect } from 'react'
import { useStore } from '../lib/store'

// LiveKit client types (minimal inline definitions)
interface RoomOptions {
  adaptiveStream?: boolean
  dynacast?: boolean
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

// LiveKit connection states
type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

// Agent message types (sent via DataChannel)
interface AgentMessage {
  type: string
  [key: string]: unknown
}

export function useLiveKitAgent(options: UseLiveKitAgentOptions = {}) {
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected')
  const [error, setError] = useState<string | null>(null)

  const roomRef = useRef<any>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const volumeIntervalRef = useRef<number | null>(null)

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

  // Start monitoring local microphone volume
  const startLocalVolumeMonitoring = useCallback(async () => {
    try {
      const audioContext = new AudioContext()
      audioContextRef.current = audioContext

      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.8
      analyserRef.current = analyser

      // Get local microphone
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })

      const source = audioContext.createMediaStreamSource(stream)
      source.connect(analyser)

      const dataArray = new Uint8Array(analyser.frequencyBinCount)

      volumeIntervalRef.current = window.setInterval(() => {
        analyser.getByteFrequencyData(dataArray)
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length
        const normalized = Math.min(1, average / 128)
        setInputVolume(normalized)
      }, 50)
    } catch (err) {
      console.error('Failed to start volume monitoring:', err)
    }
  }, [setInputVolume])

  // Stop volume monitoring
  const stopVolumeMonitoring = useCallback(() => {
    if (volumeIntervalRef.current) {
      clearInterval(volumeIntervalRef.current)
      volumeIntervalRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    analyserRef.current = null
  }, [])

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
          addMessage({
            role: 'user',
            content: message.text as string
          })
          break

        case 'transcript.assistant':
          addMessage({
            role: 'assistant',
            content: message.text as string
          })
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
          updateToolCall(message.call_id as string, {
            status: 'completed',
            result: message.result
          })
          break

        case 'tool.error':
          updateToolCall(message.call_id as string, {
            status: 'error',
            result: message.error
          })
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

      setConnectionState('connecting')
      setError(null)

      try {
        // Dynamically import LiveKit SDK
        const { Room, RoomEvent, ConnectionState } = await import('livekit-client')

        const room = new Room({
          adaptiveStream: true,
          dynacast: true,
          audioCaptureDefaults: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        } as RoomOptions)

        roomRef.current = room

        // Set up event handlers
        room.on(RoomEvent.Connected, () => {
          setConnectionState('connected')
          setSessionId(room.name || null)
          startLocalVolumeMonitoring()
          options.onConnect?.()
        })

        room.on(RoomEvent.Disconnected, () => {
          setConnectionState('disconnected')
          stopVolumeMonitoring()
          options.onDisconnect?.()
        })

        room.on(RoomEvent.Reconnecting, () => {
          setConnectionState('reconnecting')
        })

        room.on(RoomEvent.Reconnected, () => {
          setConnectionState('connected')
        })

        room.on(RoomEvent.DataReceived, handleDataMessage)

        // Helper to detect if participant is the voice agent
        const isVoiceAgent = (participant: any): boolean => {
          // Check various ways an agent can be identified:
          // 1. isAgent flag from LiveKit
          // 2. kind === 'agent' in metadata
          // 3. identity matches our agent name
          // 4. identity contains 'synrg' (our naming convention)
          const identity = participant.identity?.toLowerCase() || ''
          const kind = participant.kind || participant.metadata?.kind
          return (
            participant.isAgent === true ||
            kind === 'agent' ||
            identity === 'synrg-voice-agent' ||
            identity.includes('synrg') ||
            identity.includes('agent')
          )
        }

        room.on(RoomEvent.ParticipantConnected, (participant: any) => {
          console.log('Participant connected:', participant.identity, {
            isAgent: participant.isAgent,
            kind: participant.kind,
            metadata: participant.metadata
          })
          if (isVoiceAgent(participant)) {
            console.log('Voice agent connected!')
            setAgentConnected(true)
          }
        })

        room.on(RoomEvent.ParticipantDisconnected, (participant: any) => {
          console.log('Participant disconnected:', participant.identity)
          if (isVoiceAgent(participant)) {
            console.log('Voice agent disconnected!')
            setAgentConnected(false)
          }
        })

        // Reuse single AudioContext for output - CRITICAL for Recall.ai
        let outputAudioContext: AudioContext | null = null
        let outputAnalyser: AnalyserNode | null = null

        // Pre-create AudioContext immediately (helps with autoplay in headless contexts)
        // Use 24kHz to match agent TTS output (Cartesia) and reduce resampling
        const initAudioContext = async () => {
          try {
            outputAudioContext = new AudioContext({ sampleRate: 24000 })
            console.log('AudioContext created, state:', outputAudioContext.state, 'sampleRate:', outputAudioContext.sampleRate)
            if (outputAudioContext.state === 'suspended') {
              await outputAudioContext.resume()
              // Wait for state change to propagate
              await new Promise(resolve => setTimeout(resolve, 100))
              console.log('AudioContext resumed, state:', outputAudioContext.state)
            }
          } catch (err) {
            console.error('Failed to create AudioContext:', err)
          }
        }
        initAudioContext()

        // Monitor remote audio (agent speaking) - ATTACH FOR PLAYBACK
        // CRITICAL FOR RECALL.AI: Use HTMLAudioElement as PRIMARY method
        // Recall.ai captures system audio from DOM audio elements, NOT Web Audio API
        room.on(RoomEvent.TrackSubscribed, async (track: any, _pub: any, participant: any) => {
          if (track.kind === 'audio') {
            console.log('🔊 Audio track subscribed from:', participant.identity, 'track:', track.sid)
            setAudioStatus('connecting')

            // PRIMARY: Use HTMLAudioElement - this is what Recall.ai can capture
            // LiveKit's track.attach() creates an audio element properly configured
            try {
              const audioElement = track.attach() as HTMLAudioElement
              audioElement.id = `audio-${participant.identity}-${track.sid}`
              audioElement.autoplay = true
              audioElement.playsInline = true
              audioElement.muted = false
              audioElement.volume = 1.0
              // Position off-screen but keep in DOM for audio playback
              audioElement.style.cssText = 'position:fixed;bottom:0;left:0;width:1px;height:1px;opacity:0.01;pointer-events:none;'
              document.body.appendChild(audioElement)

              // Attempt to play - may need user interaction in some contexts
              try {
                await audioElement.play()
                console.log('✅ Audio element playing for:', participant.identity)
                setAudioStatus('playing')
              } catch (playErr: any) {
                console.warn('⚠️ Auto-play blocked, waiting for interaction:', playErr.message)
                // Set up a one-time click handler to resume playback
                const resumeAudio = async () => {
                  try {
                    await audioElement.play()
                    console.log('✅ Audio resumed after user interaction')
                    setAudioStatus('playing')
                    document.removeEventListener('click', resumeAudio)
                    document.removeEventListener('touchstart', resumeAudio)
                  } catch (e) {
                    console.error('❌ Audio resume failed:', e)
                  }
                }
                document.addEventListener('click', resumeAudio, { once: true })
                document.addEventListener('touchstart', resumeAudio, { once: true })
              }

              // Store reference for cleanup
              ;(track as any)._audioElement = audioElement

              // SECONDARY: Also set up Web Audio API for volume monitoring (UI only)
              // This doesn't play audio, just analyzes it for visualizations
              if (isVoiceAgent(participant) && outputAudioContext) {
                try {
                  if (outputAudioContext.state === 'suspended') {
                    await outputAudioContext.resume()
                  }

                  const mediaStream = new MediaStream([track.mediaStreamTrack])
                  const source = outputAudioContext.createMediaStreamSource(mediaStream)

                  outputAnalyser = outputAudioContext.createAnalyser()
                  outputAnalyser.fftSize = 256
                  outputAnalyser.smoothingTimeConstant = 0.8
                  source.connect(outputAnalyser)
                  // Don't connect to destination - HTMLAudioElement handles playback

                  const dataArray = new Uint8Array(outputAnalyser.frequencyBinCount)
                  let volumeAnimationId: number | null = null

                  const updateVolume = () => {
                    if (outputAnalyser && outputAudioContext?.state === 'running') {
                      outputAnalyser.getByteFrequencyData(dataArray)
                      const average = dataArray.reduce((a, b) => a + b) / dataArray.length
                      const normalized = Math.min(1, average / 128)
                      setOutputVolume(normalized)
                      volumeAnimationId = requestAnimationFrame(updateVolume)
                    }
                  }
                  updateVolume()

                  ;(track as any)._volumeSource = source
                  ;(track as any)._volumeAnimationId = volumeAnimationId
                  console.log('✅ Volume monitoring active for agent audio')
                } catch (volErr) {
                  console.warn('⚠️ Volume monitoring setup failed (non-critical):', volErr)
                }
              }

            } catch (err) {
              console.error('❌ Failed to attach audio track:', err)
              setAudioStatus('error')
            }
          }
        })

        // Clean up audio when tracks are unsubscribed
        room.on(RoomEvent.TrackUnsubscribed, (track: any, _pub: any, participant: any) => {
          if (track.kind === 'audio') {
            console.log('🔇 Audio track unsubscribed:', track.sid)

            // Clean up volume monitoring Web Audio nodes
            if ((track as any)._volumeAnimationId) {
              cancelAnimationFrame((track as any)._volumeAnimationId)
              delete (track as any)._volumeAnimationId
            }
            if ((track as any)._volumeSource) {
              try {
                (track as any)._volumeSource.disconnect()
              } catch (e) {
                // Already disconnected
              }
              delete (track as any)._volumeSource
            }

            // Remove audio element from DOM
            if ((track as any)._audioElement) {
              (track as any)._audioElement.remove()
              delete (track as any)._audioElement
            }
            // Also check by ID as fallback
            const audioElement = document.getElementById(`audio-${participant.identity}-${track.sid}`)
            if (audioElement) {
              audioElement.remove()
            }

            // Detach all elements from the track
            track.detach()
            console.log('✅ Audio track cleaned up:', track.sid)
          }
        })

        // Connect to the room
        await room.connect(livekitUrl, token, {
          autoSubscribe: true
        })

        console.log('Connected to LiveKit room:', room.name)

        // Check for existing participants (agent might already be in room)
        room.remoteParticipants.forEach((participant: any) => {
          console.log('Existing participant:', participant.identity, {
            isAgent: participant.isAgent,
            kind: participant.kind
          })
          if (isVoiceAgent(participant)) {
            console.log('Voice agent already in room!')
            setAgentConnected(true)

            // Subscribe to existing audio tracks
            participant.trackPublications.forEach((pub: any) => {
              if (pub.track && pub.track.kind === 'audio') {
                console.log('Existing audio track found:', pub.track.sid)
                // The TrackSubscribed event should fire for these
              }
            })
          }
        })

        // CRITICAL: Capture meeting audio via getUserMedia and publish to LiveKit
        // In Recall.ai's browser context, getUserMedia() captures the meeting audio
        // This is how we forward meeting participants' voices to the LiveKit agent
        try {
          console.log('🎤 Capturing meeting audio via getUserMedia...')
          const { LocalAudioTrack } = await import('livekit-client')

          // Request audio from the system - in Recall.ai context, this captures meeting audio
          // CRITICAL: Use 24kHz to match agent TTS output (Cartesia uses 24kHz)
          // This reduces resampling overhead in the audio pipeline
          const meetingAudioStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              // Disable processing to get raw meeting audio
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
              // Match agent sample rate to avoid resampling artifacts
              sampleRate: 24000,
              channelCount: 1
            },
            video: false
          })

          console.log('✅ Meeting audio stream obtained:', meetingAudioStream.id)
          console.log('   Audio tracks:', meetingAudioStream.getAudioTracks().map(t => ({
            id: t.id,
            label: t.label,
            enabled: t.enabled,
            readyState: t.readyState
          })))

          // Create a LocalAudioTrack from the meeting audio stream
          const meetingAudioTrack = meetingAudioStream.getAudioTracks()[0]
          if (meetingAudioTrack) {
            const localAudioTrack = new LocalAudioTrack(meetingAudioTrack, undefined, false)

            // Publish the meeting audio to the LiveKit room
            // The agent will receive this as the user's voice input
            await room.localParticipant.publishTrack(localAudioTrack, {
              name: 'meeting-audio',
              source: 'microphone' // Mark as microphone so agent treats it as user speech
            })

            console.log('✅ Meeting audio published to LiveKit room')
            console.log('   Track SID:', localAudioTrack.sid)

            // Monitor the track state
            meetingAudioTrack.onended = () => {
              console.warn('⚠️ Meeting audio track ended')
            }
            meetingAudioTrack.onmute = () => {
              console.warn('⚠️ Meeting audio track muted')
            }
            meetingAudioTrack.onunmute = () => {
              console.log('✅ Meeting audio track unmuted')
            }
          } else {
            console.error('❌ No audio track in meeting audio stream')
          }
        } catch (err) {
          console.error('❌ Failed to capture meeting audio:', err)
          // Fall back to standard microphone if getUserMedia fails
          // This handles the case where we're testing outside Recall.ai
          console.log('⚠️ Falling back to standard microphone...')
          try {
            await room.localParticipant.setMicrophoneEnabled(true)
            console.log('✅ Standard microphone enabled as fallback')
          } catch (micErr) {
            console.error('❌ Standard microphone also failed:', micErr)
          }
        }

      } catch (err) {
        setConnectionState('disconnected')
        const message = err instanceof Error ? err.message : 'Connection failed'
        setError(message)
        options.onError?.(message)
      }
    },
    [setSessionId, setAgentConnected, setAudioStatus, setOutputVolume, startLocalVolumeMonitoring, stopVolumeMonitoring, handleDataMessage, options]
  )

  // Disconnect from LiveKit room
  const disconnect = useCallback(() => {
    if (roomRef.current) {
      roomRef.current.disconnect()
      roomRef.current = null
    }
    stopVolumeMonitoring()
    reset()
    setConnectionState('disconnected')
  }, [stopVolumeMonitoring, reset])

  // Send data message to agent
  const sendData = useCallback((data: Record<string, unknown>) => {
    if (roomRef.current?.state === 'connected') {
      const encoder = new TextEncoder()
      const payload = encoder.encode(JSON.stringify(data))
      roomRef.current.localParticipant.publishData(payload, {
        reliable: true
      })
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

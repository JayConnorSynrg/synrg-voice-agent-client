import { create } from 'zustand'

type AgentState = 'listening' | 'thinking' | 'speaking' | null

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

type AudioStatus = 'waiting' | 'connecting' | 'playing' | 'error'

interface VoiceAgentStore {
  // Connection state
  sessionId: string | null
  botId: string | null
  agentConnected: boolean  // True when voice agent participant joins
  audioStatus: AudioStatus  // Audio playback status for debugging

  // Agent state
  agentState: AgentState
  inputVolume: number
  outputVolume: number

  // Messages and tool calls
  messages: Message[]
  toolCalls: ToolCall[]

  // Actions
  setSessionId: (sessionId: string | null) => void
  setBotId: (botId: string | null) => void
  setAgentConnected: (connected: boolean) => void
  setAudioStatus: (status: AudioStatus) => void
  setAgentState: (state: AgentState) => void
  setInputVolume: (volume: number) => void
  setOutputVolume: (volume: number) => void
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => void
  addToolCall: (toolCall: Omit<ToolCall, 'timestamp'>) => void
  updateToolCall: (id: string, updates: Partial<ToolCall>) => void
  clearConversation: () => void
  reset: () => void
}

const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

export const useStore = create<VoiceAgentStore>((set) => ({
  // Initial state
  sessionId: null,
  botId: null,
  agentConnected: false,
  audioStatus: 'waiting',
  agentState: null,
  inputVolume: 0,
  outputVolume: 0,
  messages: [],
  toolCalls: [],

  // Actions
  setSessionId: (sessionId) => set({ sessionId }),
  setBotId: (botId) => set({ botId }),
  setAgentConnected: (agentConnected) => set({ agentConnected }),
  setAudioStatus: (audioStatus) => set({ audioStatus }),
  setAgentState: (agentState) => set({ agentState }),
  setInputVolume: (inputVolume) => set({ inputVolume }),
  setOutputVolume: (outputVolume) => set({ outputVolume }),

  addMessage: (message) =>
    set((state) => ({
      messages: [
        ...state.messages,
        {
          ...message,
          id: generateId(),
          timestamp: Date.now()
        }
      ]
    })),

  addToolCall: (toolCall) =>
    set((state) => ({
      toolCalls: [
        ...state.toolCalls,
        {
          ...toolCall,
          timestamp: Date.now()
        }
      ]
    })),

  updateToolCall: (id, updates) =>
    set((state) => ({
      toolCalls: state.toolCalls.map((tc) =>
        tc.id === id ? { ...tc, ...updates } : tc
      )
    })),

  clearConversation: () =>
    set({
      messages: [],
      toolCalls: []
    }),

  reset: () =>
    set({
      sessionId: null,
      botId: null,
      agentConnected: false,
      audioStatus: 'waiting',
      agentState: null,
      inputVolume: 0,
      outputVolume: 0,
      messages: [],
      toolCalls: []
    })
}))

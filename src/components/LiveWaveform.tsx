import { useRef, useEffect, useState, useCallback } from 'react'

interface LiveWaveformProps {
  active?: boolean
  barWidth?: number
  barGap?: number
  barColor?: string
  height?: number
  sensitivity?: number
  smoothingTimeConstant?: number
  fftSize?: number
  fadeEdges?: boolean
  className?: string
}

export function LiveWaveform({
  active = false,
  barWidth = 3,
  barGap = 2,
  barColor = 'rgba(139, 92, 246, 0.6)',
  height = 64,
  sensitivity = 1.2,
  smoothingTimeConstant = 0.8,
  fftSize = 256,
  fadeEdges = true,
  className = ''
}: LiveWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const animationRef = useRef<number | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [dimensions, setDimensions] = useState({ width: 0, height })

  // Calculate number of bars based on container width
  const numBars = Math.floor(dimensions.width / (barWidth + barGap))

  // Initialize audio context and analyser
  const initAudio = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })
      streamRef.current = stream

      const audioContext = new AudioContext()
      audioContextRef.current = audioContext

      const analyser = audioContext.createAnalyser()
      analyser.fftSize = fftSize
      analyser.smoothingTimeConstant = smoothingTimeConstant
      analyserRef.current = analyser

      const source = audioContext.createMediaStreamSource(stream)
      source.connect(analyser)

      return true
    } catch (error) {
      console.error('Failed to initialize audio:', error)
      return false
    }
  }, [fftSize, smoothingTimeConstant])

  // Cleanup audio resources
  const cleanupAudio = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    analyserRef.current = null
  }, [])

  // Draw waveform
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const analyser = analyserRef.current
    if (!canvas || !analyser) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dataArray = new Uint8Array(analyser.frequencyBinCount)
    analyser.getByteFrequencyData(dataArray)

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Scale for retina
    const dpr = window.devicePixelRatio || 1

    // Calculate bar positions
    const totalBarWidth = barWidth + barGap
    const startX = (canvas.width / dpr - numBars * totalBarWidth + barGap) / 2

    // Draw bars
    for (let i = 0; i < numBars; i++) {
      // Sample from frequency data
      const dataIndex = Math.floor((i / numBars) * dataArray.length)
      const value = dataArray[dataIndex] / 255

      // Calculate bar height
      const barHeight = Math.max(
        4,
        value * (canvas.height / dpr - 8) * sensitivity
      )

      // Calculate x position
      const x = startX + i * totalBarWidth

      // Fade edges
      let alpha = 1
      if (fadeEdges) {
        const edgeRatio = Math.min(i, numBars - 1 - i) / (numBars * 0.15)
        alpha = Math.min(1, edgeRatio)
      }

      // Parse color and apply alpha
      ctx.fillStyle = barColor.replace(/[\d.]+\)$/, `${alpha * parseFloat(barColor.match(/[\d.]+\)$/)?.[0] || '1')})`);

      // Center vertically
      const y = (canvas.height / dpr - barHeight) / 2

      // Draw rounded bar
      const radius = barWidth / 2
      ctx.beginPath()
      ctx.roundRect(x * dpr, y * dpr, barWidth * dpr, barHeight * dpr, radius * dpr)
      ctx.fill()
    }

    animationRef.current = requestAnimationFrame(draw)
  }, [numBars, barWidth, barGap, barColor, sensitivity, fadeEdges])

  // Handle resize
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const updateDimensions = () => {
      const rect = container.getBoundingClientRect()
      setDimensions({ width: rect.width, height })
    }

    updateDimensions()

    const resizeObserver = new ResizeObserver(updateDimensions)
    resizeObserver.observe(container)

    return () => resizeObserver.disconnect()
  }, [height])

  // Set canvas size for retina
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || dimensions.width === 0) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = dimensions.width * dpr
    canvas.height = dimensions.height * dpr
    canvas.style.width = `${dimensions.width}px`
    canvas.style.height = `${dimensions.height}px`
  }, [dimensions])

  // Start/stop audio capture based on active prop
  useEffect(() => {
    if (active) {
      initAudio().then(success => {
        if (success) {
          draw()
        }
      })
    } else {
      cleanupAudio()
    }

    return cleanupAudio
  }, [active, initAudio, cleanupAudio, draw])

  // Idle animation when not active
  useEffect(() => {
    if (active) return

    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let frame: number
    let time = 0

    const drawIdle = () => {
      const dpr = window.devicePixelRatio || 1
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const totalBarWidth = barWidth + barGap
      const startX = (canvas.width / dpr - numBars * totalBarWidth + barGap) / 2

      for (let i = 0; i < numBars; i++) {
        // Gentle wave animation
        const wave = Math.sin(time * 2 + i * 0.3) * 0.3 + 0.5
        const barHeight = 4 + wave * 8

        const x = startX + i * totalBarWidth
        const y = (canvas.height / dpr - barHeight) / 2

        // Fade edges
        let alpha = 0.3
        if (fadeEdges) {
          const edgeRatio = Math.min(i, numBars - 1 - i) / (numBars * 0.15)
          alpha = Math.min(0.3, edgeRatio * 0.3)
        }

        ctx.fillStyle = barColor.replace(/[\d.]+\)$/, `${alpha})`)

        const radius = barWidth / 2
        ctx.beginPath()
        ctx.roundRect(x * dpr, y * dpr, barWidth * dpr, barHeight * dpr, radius * dpr)
        ctx.fill()
      }

      time += 0.016
      frame = requestAnimationFrame(drawIdle)
    }

    drawIdle()
    return () => cancelAnimationFrame(frame)
  }, [active, numBars, barWidth, barGap, barColor, fadeEdges, dimensions])

  return (
    <div
      ref={containerRef}
      className={`relative ${className}`}
      style={{ height }}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full"
      />
    </div>
  )
}

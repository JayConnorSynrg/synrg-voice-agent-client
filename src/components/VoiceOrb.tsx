import { useRef, useEffect, useState, useMemo } from 'react'
import { motion, useAnimationFrame } from 'framer-motion'

type AgentState = 'listening' | 'thinking' | 'speaking' | null

interface VoiceOrbProps {
  agentState: AgentState
  inputVolume: number // 0-1
  outputVolume: number // 0-1
  size?: number
}

// SYNRG Brand Color Palette - Pastel/Diffused variant (thin opaque glass effect)
const COLORS = {
  mint: '#A8F0D4',      // Pastel mint - softer seafoam
  purple: '#C4B5FD',    // Pastel lavender - soft purple
  emerald: '#86EFAC',   // Pastel sage - soft green
  cyan: '#A5F3FC',      // Pastel sky - soft cyan
  gold: '#FDE68A',      // Pastel cream - soft gold
  navy: '#CBD5E1',      // Soft slate - diffused navy
}

export function VoiceOrb({
  agentState,
  inputVolume,
  outputVolume,
  size = 280
}: VoiceOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const timeRef = useRef(0)
  const animationRef = useRef<number | null>(null)

  // Animation speed based on state
  const speed = useMemo(() => {
    if (agentState === 'speaking') return 1.5 + outputVolume * 2
    if (agentState === 'listening') return 1.2 + inputVolume * 1.5
    if (agentState === 'thinking') return 2
    return 0.8 // idle
  }, [agentState, inputVolume, outputVolume])

  // Scale pulse based on audio
  const scale = useMemo(() => {
    if (agentState === 'speaking') return 1 + outputVolume * 0.08
    if (agentState === 'listening') return 1 + inputVolume * 0.05
    return 1
  }, [agentState, inputVolume, outputVolume])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set up for retina
    const dpr = window.devicePixelRatio || 1
    canvas.width = size * dpr
    canvas.height = size * dpr
    canvas.style.width = `${size}px`
    canvas.style.height = `${size}px`
    ctx.scale(dpr, dpr)

    const centerX = size / 2
    const centerY = size / 2
    const radius = size * 0.38 // Orb takes ~76% of canvas

    const draw = () => {
      timeRef.current += 0.016 * speed

      // Clear canvas
      ctx.clearRect(0, 0, size, size)

      // Create gradient with rotating colors
      const time = timeRef.current

      // Calculate color positions (rotating around the orb)
      const angle1 = time * 0.5
      const angle2 = time * 0.5 + (Math.PI * 2 / 3)
      const angle3 = time * 0.5 + (Math.PI * 4 / 3)

      // Create radial gradient with multiple color stops
      const gradient = ctx.createRadialGradient(
        centerX + Math.cos(angle1) * radius * 0.3,
        centerY + Math.sin(angle1) * radius * 0.3,
        0,
        centerX,
        centerY,
        radius
      )

      // Slow, smooth color mixing for glass-like diffusion
      const colorShift = (Math.sin(time * 0.15) + 1) / 2  // Slower transition
      const secondaryShift = (Math.cos(time * 0.12) + 1) / 2

      // Pastel glass effect - soft blended color stops with high transparency overlap
      gradient.addColorStop(0, mixColors(COLORS.mint, COLORS.cyan, colorShift * 0.4))
      gradient.addColorStop(0.2, mixColors(COLORS.cyan, COLORS.mint, secondaryShift * 0.5))
      gradient.addColorStop(0.4, mixColors(COLORS.mint, COLORS.purple, colorShift * 0.3))
      gradient.addColorStop(0.6, mixColors(COLORS.purple, COLORS.cyan, 1 - colorShift * 0.4))
      gradient.addColorStop(0.8, mixColors(COLORS.cyan, COLORS.emerald, secondaryShift * 0.3))
      gradient.addColorStop(1, mixColors(COLORS.emerald, COLORS.mint, colorShift * 0.5))

      // Draw main orb
      ctx.beginPath()
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
      ctx.fillStyle = gradient
      ctx.fill()

      // Diffused secondary layer - soft glass reflection
      const gradient2 = ctx.createRadialGradient(
        centerX + Math.cos(angle2) * radius * 0.3,
        centerY + Math.sin(angle2) * radius * 0.3,
        0,
        centerX,
        centerY,
        radius * 1.1
      )
      gradient2.addColorStop(0, `${COLORS.cyan}50`)
      gradient2.addColorStop(0.3, `${COLORS.mint}30`)
      gradient2.addColorStop(0.6, `${COLORS.purple}20`)
      gradient2.addColorStop(1, 'transparent')

      ctx.beginPath()
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
      ctx.fillStyle = gradient2
      ctx.fill()

      // Third layer - subtle color diffusion
      const gradient3 = ctx.createRadialGradient(
        centerX + Math.cos(angle3) * radius * 0.25,
        centerY + Math.sin(angle3) * radius * 0.25,
        0,
        centerX,
        centerY,
        radius * 0.9
      )
      gradient3.addColorStop(0, `${COLORS.purple}40`)
      gradient3.addColorStop(0.35, `${COLORS.cyan}25`)
      gradient3.addColorStop(0.7, `${COLORS.emerald}15`)
      gradient3.addColorStop(1, 'transparent')

      ctx.beginPath()
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
      ctx.fillStyle = gradient3
      ctx.fill()

      // Glass-like inner highlight - frosted effect
      const highlightGradient = ctx.createRadialGradient(
        centerX - radius * 0.25,
        centerY - radius * 0.25,
        0,
        centerX,
        centerY,
        radius
      )
      highlightGradient.addColorStop(0, 'rgba(255, 255, 255, 0.35)')
      highlightGradient.addColorStop(0.15, 'rgba(255, 255, 255, 0.2)')
      highlightGradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.08)')
      highlightGradient.addColorStop(1, 'transparent')

      ctx.beginPath()
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
      ctx.fillStyle = highlightGradient
      ctx.fill()

      // Soft edge blur effect - thin glass rim
      const edgeGradient = ctx.createRadialGradient(
        centerX,
        centerY,
        radius * 0.85,
        centerX,
        centerY,
        radius
      )
      edgeGradient.addColorStop(0, 'transparent')
      edgeGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.1)')
      edgeGradient.addColorStop(1, 'rgba(255, 255, 255, 0.03)')

      ctx.beginPath()
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
      ctx.fillStyle = edgeGradient
      ctx.fill()

      animationRef.current = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [size, speed])

  return (
    <div
      className="relative"
      style={{ width: size, height: size }}
    >
      {/* Soft diffused glow under the orb - pastel glass effect */}
      <motion.div
        className="absolute rounded-full blur-3xl"
        style={{
          width: size * 0.8,
          height: size * 0.2,
          left: size * 0.1,
          bottom: -size * 0.08,
          background: 'linear-gradient(90deg, rgba(168, 240, 212, 0.3), rgba(165, 243, 252, 0.25), rgba(196, 181, 253, 0.2))',
        }}
        animate={{
          opacity: agentState ? 0.6 : 0.3,
          scaleX: agentState === 'speaking' ? 1.08 : 1,
        }}
        transition={{ duration: 0.5, ease: 'easeInOut' }}
      />

      {/* The orb canvas */}
      <motion.canvas
        ref={canvasRef}
        className="relative z-10"
        animate={{
          scale,
        }}
        transition={{
          type: 'spring',
          stiffness: 300,
          damping: 20,
        }}
      />

      {/* Subtle outer glow when active - pastel diffused halo */}
      {agentState && (
        <motion.div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            background: 'radial-gradient(circle, transparent 55%, rgba(168, 240, 212, 0.12) 75%, rgba(165, 243, 252, 0.06) 100%)',
          }}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1.08 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      )}
    </div>
  )
}

// Helper function to mix two hex colors
function mixColors(color1: string, color2: string, ratio: number): string {
  const hex = (c: string) => parseInt(c.slice(1), 16)
  const r = (c: number) => (c >> 16) & 255
  const g = (c: number) => (c >> 8) & 255
  const b = (c: number) => c & 255

  const c1 = hex(color1)
  const c2 = hex(color2)

  const mixedR = Math.round(r(c1) * (1 - ratio) + r(c2) * ratio)
  const mixedG = Math.round(g(c1) * (1 - ratio) + g(c2) * ratio)
  const mixedB = Math.round(b(c1) * (1 - ratio) + b(c2) * ratio)

  return `rgb(${mixedR}, ${mixedG}, ${mixedB})`
}

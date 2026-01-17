import { useEffect, useRef, useState, useCallback } from 'react'

type AgentState = 'listening' | 'thinking' | 'speaking' | null

interface WebGLOrbProps {
  agentState: AgentState
  inputVolume?: number
  outputVolume?: number
  isConnected?: boolean
  size?: number
}

/**
 * Animated Orb Component - ReactBits style ring glow
 * Based on https://reactbits.dev/backgrounds/orb
 */
export function WebGLOrb({
  agentState,
  inputVolume = 0,
  outputVolume = 0,
  isConnected = false,
  size = 280
}: WebGLOrbProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [webglReady, setWebglReady] = useState(false)
  const [useWebGL, setUseWebGL] = useState(true)
  const animationRef = useRef<number | null>(null)
  const programRef = useRef<any>(null)
  const rendererRef = useRef<any>(null)
  const intensityRef = useRef<number>(0) // Smoothed intensity value

  // Calculate hue shift based on state (small values to stay in blue/purple)
  const getHue = useCallback(() => {
    if (!isConnected) return 30 // Slight purple shift while connecting
    if (agentState === 'speaking') return 0 // No shift - pure blue
    if (agentState === 'listening') return -15 // Slight cyan shift
    if (agentState === 'thinking') return 20 // Slight purple shift
    return 0 // Ready - pure blue
  }, [isConnected, agentState])

  // WebGL initialization
  useEffect(() => {
    const container = containerRef.current
    if (!container || !useWebGL) return

    let cleanup: (() => void) | null = null

    const initWebGL = async () => {
      try {
        const { Mesh, Program, Renderer, Triangle, Vec3 } = await import('ogl')

        const renderer = new Renderer({ alpha: true, premultipliedAlpha: false })
        rendererRef.current = renderer
        const gl = renderer.gl

        if (!gl) {
          console.warn('WebGL not available, using CSS fallback')
          setUseWebGL(false)
          return
        }

        gl.clearColor(0, 0, 0, 0)
        container.appendChild(gl.canvas)

        const vert = /* glsl */ `
          precision highp float;
          attribute vec2 position;
          attribute vec2 uv;
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = vec4(position, 0.0, 1.0);
          }
        `

        // ReactBits orb shader - creates ring glow effect
        const frag = /* glsl */ `
          precision highp float;

          uniform float iTime;
          uniform vec3 iResolution;
          uniform float hue;
          uniform float hover;
          uniform float hoverIntensity;
          uniform float intensity; // Audio-reactive intensity (0-1)
          uniform vec3 backgroundColor;
          varying vec2 vUv;

          vec3 rgb2yiq(vec3 c) {
            float y = dot(c, vec3(0.299, 0.587, 0.114));
            float i = dot(c, vec3(0.596, -0.274, -0.322));
            float q = dot(c, vec3(0.211, -0.523, 0.312));
            return vec3(y, i, q);
          }

          vec3 yiq2rgb(vec3 c) {
            float r = c.x + 0.956 * c.y + 0.621 * c.z;
            float g = c.x - 0.272 * c.y - 0.647 * c.z;
            float b = c.x - 1.106 * c.y + 1.703 * c.z;
            return vec3(r, g, b);
          }

          vec3 adjustHue(vec3 color, float hueDeg) {
            float hueRad = hueDeg * 3.14159265 / 180.0;
            vec3 yiq = rgb2yiq(color);
            float cosA = cos(hueRad);
            float sinA = sin(hueRad);
            float i = yiq.y * cosA - yiq.z * sinA;
            float q = yiq.y * sinA + yiq.z * cosA;
            yiq.y = i;
            yiq.z = q;
            return yiq2rgb(yiq);
          }

          vec3 hash33(vec3 p3) {
            p3 = fract(p3 * vec3(0.1031, 0.11369, 0.13787));
            p3 += dot(p3, p3.yxz + 19.19);
            return -1.0 + 2.0 * fract(vec3(
              p3.x + p3.y,
              p3.x + p3.z,
              p3.y + p3.z
            ) * p3.zyx);
          }

          float snoise3(vec3 p) {
            const float K1 = 0.333333333;
            const float K2 = 0.166666667;
            vec3 i = floor(p + (p.x + p.y + p.z) * K1);
            vec3 d0 = p - (i - (i.x + i.y + i.z) * K2);
            vec3 e = step(vec3(0.0), d0 - d0.yzx);
            vec3 i1 = e * (1.0 - e.zxy);
            vec3 i2 = 1.0 - e.zxy * (1.0 - e);
            vec3 d1 = d0 - (i1 - K2);
            vec3 d2 = d0 - (i2 - K1);
            vec3 d3 = d0 - 0.5;
            vec4 h = max(0.6 - vec4(
              dot(d0, d0),
              dot(d1, d1),
              dot(d2, d2),
              dot(d3, d3)
            ), 0.0);
            vec4 n = h * h * h * h * vec4(
              dot(d0, hash33(i)),
              dot(d1, hash33(i + i1)),
              dot(d2, hash33(i + i2)),
              dot(d3, hash33(i + 1.0))
            );
            return dot(vec4(31.316), n);
          }

          vec4 extractAlpha(vec3 colorIn) {
            float a = max(max(colorIn.r, colorIn.g), colorIn.b);
            return vec4(colorIn.rgb / (a + 1e-5), a);
          }

          const vec3 baseColor1 = vec3(0.5, 0.35, 0.7);    // Purple with slight amber warmth
          const vec3 baseColor2 = vec3(0.2, 0.85, 0.65);  // Teal-green (prominent)
          const vec3 baseColor3 = vec3(0.25, 0.1, 0.55);  // Deep purple (prominent)
          const float innerRadius = 0.6;
          const float noiseScale = 0.65;

          float light1(float intensity, float attenuation, float dist) {
            return intensity / (1.0 + dist * attenuation);
          }
          float light2(float intensity, float attenuation, float dist) {
            return intensity / (1.0 + dist * dist * attenuation);
          }

          vec4 draw(vec2 uv) {
            vec3 color1 = adjustHue(baseColor1, hue);
            vec3 color2 = adjustHue(baseColor2, hue);
            vec3 color3 = adjustHue(baseColor3, hue);

            float ang = atan(uv.y, uv.x);
            float len = length(uv);
            float invLen = len > 0.0 ? 1.0 / len : 0.0;

            float bgLuminance = dot(backgroundColor, vec3(0.299, 0.587, 0.114));

            // Audio-reactive pulse: scale radius and brightness
            float intensityBoost = 1.0 + intensity * 0.15; // Scale boost (up to 15%)
            float brightnessBoost = 1.0 + intensity * 0.6; // Brightness boost (up to 60%)

            float n0 = snoise3(vec3(uv * noiseScale, iTime * 0.5)) * 0.5 + 0.5;
            float r0 = mix(mix(innerRadius, 1.0, 0.4), mix(innerRadius, 1.0, 0.6), n0);
            r0 *= intensityBoost; // Audio-reactive radius expansion
            float d0 = distance(uv, (r0 * invLen) * uv);
            float v0 = light1(1.0, 10.0, d0);

            v0 *= smoothstep(r0 * 1.05, r0, len);
            float innerFade = smoothstep(r0 * 0.8, r0 * 0.95, len);
            v0 *= mix(innerFade, 1.0, bgLuminance * 0.7);
            float cl = cos(ang + iTime * 2.0) * 0.5 + 0.5;

            float a = iTime * -1.0;
            vec2 pos = vec2(cos(a), sin(a)) * r0;
            float d = distance(uv, pos);
            float v1 = light2(1.5, 5.0, d) * brightnessBoost; // Audio-reactive glow
            v1 *= light1(1.0, 50.0, d0);

            float v2 = smoothstep(1.0, mix(innerRadius, 1.0, n0 * 0.5), len);
            float v3 = smoothstep(innerRadius, mix(innerRadius, 1.0, 0.5), len);

            vec3 colBase = mix(color1, color2, cl);
            float fadeAmount = mix(1.0, 0.1, bgLuminance);

            vec3 darkCol = mix(color3, colBase, v0);
            darkCol = (darkCol + v1) * v2 * v3 * brightnessBoost; // Audio-reactive brightness
            darkCol = clamp(darkCol, 0.0, 1.0);

            vec3 lightCol = (colBase + v1) * mix(1.0, v2 * v3, fadeAmount);
            lightCol = mix(backgroundColor, lightCol, v0);
            lightCol = clamp(lightCol, 0.0, 1.0);

            vec3 finalCol = mix(darkCol, lightCol, bgLuminance);

            return extractAlpha(finalCol);
          }

          vec4 mainImage(vec2 fragCoord) {
            vec2 center = iResolution.xy * 0.5;
            float sz = min(iResolution.x, iResolution.y);
            vec2 uv = (fragCoord - center) / sz * 2.0;

            // Subtle hover distortion
            uv.x += hover * hoverIntensity * 0.1 * sin(uv.y * 10.0 + iTime);
            uv.y += hover * hoverIntensity * 0.1 * sin(uv.x * 10.0 + iTime);

            return draw(uv);
          }

          void main() {
            vec2 fragCoord = vUv * iResolution.xy;
            vec4 col = mainImage(fragCoord);
            gl_FragColor = vec4(col.rgb * col.a, col.a);
          }
        `

        const geometry = new Triangle(gl)
        const program = new Program(gl, {
          vertex: vert,
          fragment: frag,
          uniforms: {
            iTime: { value: 0 },
            iResolution: { value: new Vec3(size, size, 1) },
            hue: { value: getHue() },
            hover: { value: 0 },
            hoverIntensity: { value: 0.2 },
            intensity: { value: 0 }, // Audio-reactive intensity
            backgroundColor: { value: new Vec3(1, 1, 1) } // White background
          }
        })
        programRef.current = program

        const mesh = new Mesh(gl, { geometry, program })

        // Set size with device pixel ratio
        const dpr = window.devicePixelRatio || 1
        renderer.setSize(size * dpr, size * dpr)
        gl.canvas.style.width = size + 'px'
        gl.canvas.style.height = size + 'px'
        program.uniforms.iResolution.value.set(size * dpr, size * dpr, 1)

        setWebglReady(true)

        // Animation loop
        const update = (t: number) => {
          animationRef.current = requestAnimationFrame(update)
          program.uniforms.iTime.value = t * 0.001
          program.uniforms.hue.value = getHue()

          // Smooth intensity interpolation (lerp with 0.15 factor for responsiveness)
          const targetIntensity = outputVolume
          intensityRef.current += (targetIntensity - intensityRef.current) * 0.15
          program.uniforms.intensity.value = intensityRef.current

          renderer.render({ scene: mesh })
        }
        animationRef.current = requestAnimationFrame(update)

        cleanup = () => {
          if (animationRef.current) {
            cancelAnimationFrame(animationRef.current)
          }
          if (container.contains(gl.canvas)) {
            container.removeChild(gl.canvas)
          }
          try {
            gl.getExtension('WEBGL_lose_context')?.loseContext()
          } catch (e) {
            // Ignore cleanup errors
          }
        }
      } catch (error) {
        console.warn('WebGL initialization failed:', error)
        setUseWebGL(false)
      }
    }

    initWebGL()

    return () => {
      if (cleanup) cleanup()
    }
  }, [size, useWebGL, getHue, outputVolume])

  // Update hue when state changes
  useEffect(() => {
    if (programRef.current) {
      programRef.current.uniforms.hue.value = getHue()
    }
  }, [agentState, isConnected, getHue])

  // CSS Fallback - ring glow style
  const hue = getHue()
  const baseIntensity = isConnected ? (agentState ? 1 : 0.7) : 0.5
  const intensity = baseIntensity + outputVolume * 0.5 // Add audio-reactive boost
  const pulseSpeed = agentState === 'speaking' ? '0.5s' : agentState === 'thinking' ? '0.8s' : '2s'

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden"
      style={{
        width: size,
        height: size,
        minWidth: size,
        minHeight: size
      }}
    >
      {/* CSS Fallback - ring glow style - ONLY show when WebGL not ready */}
      {!useWebGL && (
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: `radial-gradient(circle at 50% 50%,
              transparent 0%,
              transparent 50%,
              hsla(${hue}, 70%, 50%, ${intensity * 0.3}) 55%,
              hsla(${hue}, 80%, 60%, ${intensity * 0.8}) 65%,
              hsla(${hue}, 70%, 50%, ${intensity * 0.5}) 75%,
              hsla(${hue}, 60%, 40%, ${intensity * 0.2}) 85%,
              transparent 100%)`,
            boxShadow: `
              0 0 ${40 * intensity}px ${15 * intensity}px hsla(${hue}, 70%, 50%, 0.4),
              inset 0 0 ${60 * intensity}px hsla(${hue}, 60%, 30%, 0.3)
            `,
            animation: `pulse ${pulseSpeed} ease-in-out infinite`
          }}
        />
      )}
    </div>
  )
}

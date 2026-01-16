/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Clean stark white theme
        background: '#ffffff',
        surface: '#ffffff',
        'surface-elevated': '#ffffff',
        border: '#e5e5e5',
        // SYNRG Brand Colors (from logo)
        synrg: {
          mint: '#4EEAAA',       // Main G accent - seafoam/mint
          purple: '#8B5CF6',    // Purple accent circles
          emerald: '#22C55E',   // Green accent
          cyan: '#22D3EE',      // Cyan dots
          gold: '#F5A623',      // Yellow/gold accent
          coral: '#EF4444',     // Red x accent
          black: '#1A1A1A',     // Logo text black
          navy: '#0F172A',      // Dark navy accent
        },
        // Orb accent colors (using SYNRG palette)
        primary: {
          DEFAULT: '#4EEAAA',   // SYNRG Mint
          light: '#6EE7B7',
          dark: '#10B981',
        },
        secondary: {
          DEFAULT: '#8B5CF6',   // SYNRG Purple
          light: '#A78BFA',
          dark: '#7C3AED',
        },
        accent: {
          DEFAULT: '#22D3EE',   // SYNRG Cyan
          light: '#67E8F9',
          dark: '#06B6D4',
        },
        // Status colors
        success: '#22C55E',     // SYNRG Emerald
        warning: '#F5A623',     // SYNRG Gold
        error: '#EF4444',       // SYNRG Coral
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'fade-out': 'fadeOut 0.5s ease-out',
        'slide-up': 'slideUp 0.5s ease-out',
        'slide-down': 'slideDown 0.5s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeOut: {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          '0%': { opacity: '1', transform: 'translateY(0)' },
          '100%': { opacity: '0', transform: 'translateY(20px)' },
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
    },
  },
  plugins: [],
}

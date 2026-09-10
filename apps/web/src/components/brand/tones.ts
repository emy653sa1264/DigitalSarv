/** Tone palette from the prototype's badge() / tint() helpers. */
export type BrandTone = 'blue' | 'cyan' | 'violet' | 'amber' | 'green' | 'pink' | 'ink'

export interface ToneSpec {
  base: string
  dark: string
  soft: string
  ink: string
  grad: [string, string, string]
  glow: string
}

export const TONES: Record<BrandTone, ToneSpec> = {
  blue: { base: '#2f6df6', dark: '#1b45b8', soft: '#e3ecff', ink: '#1b45b8', grad: ['#7ea6ff', '#2f6df6', '#1b45b8'], glow: 'rgba(47,109,246,0.42)' },
  cyan: { base: '#0fa9bd', dark: '#0b7686', soft: '#d6f4f8', ink: '#0b5a66', grad: ['#7be0ec', '#0fa9bd', '#0b7686'], glow: 'rgba(15,169,189,0.4)' },
  violet: { base: '#7c5cf5', dark: '#4c31b8', soft: '#ebe5ff', ink: '#4c31b8', grad: ['#b9a4ff', '#7c5cf5', '#4c31b8'], glow: 'rgba(124,92,245,0.42)' },
  amber: { base: '#ef9d0c', dark: '#a86a05', soft: '#fdeecd', ink: '#5c4306', grad: ['#ffd27a', '#ef9d0c', '#a86a05'], glow: 'rgba(239,157,12,0.4)' },
  green: { base: '#1fa968', dark: '#14764a', soft: '#d7f4e6', ink: '#0d5334', grad: ['#79e0b0', '#1fa968', '#14764a'], glow: 'rgba(31,169,104,0.4)' },
  pink: { base: '#ea5399', dark: '#a82c69', soft: '#ffe1ef', ink: '#7c1f4d', grad: ['#ffa8cf', '#ea5399', '#a82c69'], glow: 'rgba(234,83,153,0.4)' },
  ink: { base: '#1c2233', dark: '#07090f', soft: '#eef2fb', ink: '#4a5268', grad: ['#5b6480', '#1c2233', '#07090f'], glow: 'rgba(7,9,15,0.4)' },
}

/** Service kind → tone, as used across the prototype. */
export const SERVICE_TONE = { school: 'blue', print: 'cyan', docs: 'cyan', flyer: 'violet', cart: 'amber', repair: 'green', pickup: 'pink' } as const

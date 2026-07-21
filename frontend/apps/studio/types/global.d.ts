// Global ambient declarations for browser globals injected by third-party
// scripts. Keeps callsites cast-free.

declare global {
  interface Window {
    // gtag.js — defined by the inline init in google-analytics-tag.tsx and
    // re-bound by gtag.js once it loads. May be undefined before consent /
    // before the script has executed.
    gtag?: (...args: unknown[]) => void
    dataLayer?: unknown[]
    // Reddit Pixel — defined by the inline init in reddit-pixel.tsx and
    // re-bound by pixel.js once it loads. May be undefined before consent.
    rdt?: (...args: unknown[]) => void
    // Microsoft Clarity — bootstrapped by lib/clarity.tsx (queues calls on
    // `.q`) and re-bound by the async clarity.ms tag once it loads. Undefined
    // before the script runs / outside app.powabase.ai.
    clarity?: {
      (...args: unknown[]): void
      q?: unknown[]
    }
  }
}

export {}

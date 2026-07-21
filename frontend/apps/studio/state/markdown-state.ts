"use client";

import { proxy, useSnapshot } from "valtio";

const STORAGE_KEY = "agentic-markdown-render";

export const markdownState = proxy({
  renderMarkdown: true,
  isInitialized: false,

  toggle() {
    this.renderMarkdown = !this.renderMarkdown;
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, String(this.renderMarkdown));
    }
  },

  initialize() {
    if (this.isInitialized) return;
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(STORAGE_KEY);
      this.renderMarkdown = stored === null ? true : stored === "true";
    }
    this.isInitialized = true;
  },
});

export function useMarkdownState() {
  return useSnapshot(markdownState);
}

'use client';

import * as React from "react"

import { Segmented } from "@/components/ui/segmented"

type ThemeChoice = "system" | "light" | "dark"

const OPTIONS: { value: ThemeChoice; label: string }[] = [
  { value: "system", label: "Як у системі" },
  { value: "light", label: "Світла" },
  { value: "dark", label: "Темна" },
]

function setThemeCookie(value: ThemeChoice) {
  document.cookie = `theme=${value}; path=/; max-age=31536000; samesite=lax`
}

function readThemeCookie(): ThemeChoice {
  const match = document.cookie.match(/(?:^|; )theme=(light|dark|system)/)
  return (match?.[1] as ThemeChoice | undefined) ?? "system"
}

function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = React.useState<ThemeChoice>("system")

  // Syncs the control to the persisted choice once mounted. The cookie is an
  // external, non-React-owned source, so this is a one-time correction, not a
  // render loop — the lint rule can't tell the two apart.
  React.useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(readThemeCookie())
  }, [])

  function choose(next: ThemeChoice) {
    const dark = next === "system" ? window.matchMedia("(prefers-color-scheme: dark)").matches : next === "dark"
    document.documentElement.classList.toggle("dark", dark)
    setThemeCookie(next)
    setTheme(next)
  }

  return <Segmented label="Тема" options={OPTIONS} value={theme} onChange={choose} className={className} />
}

export { ThemeToggle }

'use client';

import * as React from "react"
import { Switch as SwitchPrimitive } from "@base-ui/react/switch"

import { cn } from "@/lib/utils"

function setThemeCookie(value: "light" | "dark") {
  document.cookie = `theme=${value}; path=/; max-age=31536000; samesite=lax`
}

function ThemeToggle({
  className,
  ...props
}: Omit<React.ComponentProps<typeof SwitchPrimitive.Root>, "checked" | "defaultChecked" | "onCheckedChange">) {
  const [checked, setChecked] = React.useState(false)

  // Syncs the switch's visual position to whatever `.dark` state the
  // cookie (SSR) or the system-preference inline script (app/layout.tsx)
  // already applied to <html>, before the browser paints — this is what
  // fixes the toggle always rendering "off" even when the page loaded dark.
  // One-time correction from an external, non-React-owned source (the DOM
  // class list set before this component mounted), not a cascading
  // render loop — the lint rule can't distinguish the two.
  React.useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChecked(document.documentElement.classList.contains("dark"))
  }, [])

  return (
    <SwitchPrimitive.Root
      data-slot="theme-toggle"
      aria-label="Перемкнути темну тему"
      checked={checked}
      className={cn(
        "relative inline-flex h-6 w-[42px] shrink-0 cursor-pointer items-center rounded-full border border-border bg-muted outline-none transition-colors data-[checked]:bg-accent-soft focus-visible:ring-3 focus-visible:ring-accent/40",
        className
      )}
      onCheckedChange={(next) => {
        document.documentElement.classList.toggle("dark", next)
        setThemeCookie(next ? "dark" : "light")
        setChecked(next)
      }}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-[18px] translate-x-0.5 rounded-full bg-background shadow transition-transform duration-260 ease-[cubic-bezier(.4,0,.2,1)] data-[checked]:translate-x-[20px]" />
    </SwitchPrimitive.Root>
  )
}

export { ThemeToggle }

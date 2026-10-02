'use client';

import * as React from "react"
import { Switch as SwitchPrimitive } from "@base-ui/react/switch"

import { cn } from "@/lib/utils"

function ThemeToggle({
  className,
  onCheckedChange,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="theme-toggle"
      aria-label="Перемкнути темну тему"
      className={cn(
        "relative inline-flex h-6 w-[42px] shrink-0 cursor-pointer items-center rounded-full border border-border bg-muted transition-colors data-[checked]:bg-accent-soft",
        className
      )}
      onCheckedChange={(checked, eventDetails) => {
        document.documentElement.classList.toggle("dark", checked)
        onCheckedChange?.(checked, eventDetails)
      }}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-[18px] translate-x-0.5 rounded-full bg-background shadow transition-transform duration-260 ease-[cubic-bezier(.4,0,.2,1)] data-[checked]:translate-x-[20px]" />
    </SwitchPrimitive.Root>
  )
}

export { ThemeToggle }

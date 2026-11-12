'use client';

import * as React from "react"
import { Select as SelectPrimitive } from "@base-ui/react/select"

import { cn } from "@/lib/utils"

function Select<Value, Multiple extends boolean | undefined = false>(
  props: SelectPrimitive.Root.Props<Value, Multiple>
) {
  return <SelectPrimitive.Root {...props} />
}

function SelectTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        "flex min-h-[2.75rem] w-full items-center justify-between gap-2 rounded-[4px] border-2 border-line bg-field px-[.8rem] text-base outline-none focus-visible:border-navy focus-visible:outline-none",
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon className="shrink-0 text-muted-foreground">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
          <path
            d="M4 6l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

function SelectValue({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return (
    <SelectPrimitive.Value
      className={cn("min-w-0 flex-1 truncate text-left", className)}
      {...props}
    />
  )
}

function SelectContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Popup>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner sideOffset={6}>
        <SelectPrimitive.Popup
          data-slot="select-content"
          className={cn(
            "max-h-64 overflow-auto rounded-[6px] border border-line bg-popover p-1 text-popover-foreground shadow-[4px_4px_0_rgba(0,0,0,.14)]",
            className
          )}
          {...props}
        >
          {children}
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  )
}

function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "flex cursor-pointer items-center justify-between gap-2 rounded-sm px-2.5 py-1.5 text-sm outline-none data-[highlighted]:bg-accent-soft data-[highlighted]:text-accent-text",
        className
      )}
      {...props}
    >
      <SelectPrimitive.ItemText className="min-w-0 break-words">{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}

function SelectGroup({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Group>) {
  return (
    <SelectPrimitive.Group data-slot="select-group" className={cn(className)} {...props}>
      {children}
    </SelectPrimitive.Group>
  )
}

function SelectGroupLabel({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.GroupLabel>) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-group-label"
      className={cn("px-2.5 py-1 text-xs font-semibold text-muted-foreground", className)}
      {...props}
    >
      {children}
    </SelectPrimitive.GroupLabel>
  )
}

export {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectGroupLabel,
}

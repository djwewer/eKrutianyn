'use client';

import * as React from "react"
import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion"

import { cn } from "@/lib/utils"

function AccordionRoot({
  className,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Root>) {
  return (
    <AccordionPrimitive.Root
      data-slot="accordion"
      className={cn("flex flex-col gap-2.5", className)}
      {...props}
    />
  )
}

function AccordionItem({
  className,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Item>) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-colors data-[open]:border-accent",
        className
      )}
      {...props}
    />
  )
}

function AccordionTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Trigger>) {
  return (
    <AccordionPrimitive.Header>
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          "group flex w-full items-center justify-between gap-3.5 rounded-lg px-5 py-4 text-left font-medium transition-colors outline-none hover:bg-accent-soft focus-visible:inset-ring-2 focus-visible:inset-ring-accent/50 data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
          className
        )}
        {...props}
      >
        {children}
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          className="shrink-0 text-muted-foreground transition-transform duration-260 ease-[cubic-bezier(.4,0,.2,1)] group-data-panel-open:rotate-180"
        >
          <path
            d="M4 6l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  )
}

function AccordionContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Panel>) {
  return (
    <AccordionPrimitive.Panel
      data-slot="accordion-content"
      className={cn(
        "h-[var(--accordion-panel-height)] overflow-hidden transition-[height] duration-300 ease-[cubic-bezier(.4,0,.2,1)] data-[starting-style]:h-0 data-[ending-style]:h-0",
        className
      )}
      {...props}
    >
      <div className="px-5 pb-5">{children}</div>
    </AccordionPrimitive.Panel>
  )
}

export { AccordionRoot, AccordionItem, AccordionTrigger, AccordionContent }

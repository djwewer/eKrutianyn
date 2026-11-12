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
        "overflow-hidden rounded-[6px] border border-line bg-paper transition-colors data-[open]:border-navy [&_[data-slot=accordion-item]]:border-dashed [&_[data-slot=accordion-item]]:bg-background animate-[kmFadeUp_460ms_cubic-bezier(0.2,0.7,0.3,1)_both]",
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
          "group flex w-full items-center gap-[.8rem] px-4 py-[.85rem] text-left font-display text-[1.12rem] leading-[1.2] font-semibold tracking-[.04em] uppercase transition-colors outline-none hover:bg-sky-soft focus-visible:inset-ring-2 focus-visible:inset-ring-sky data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
          className
        )}
        {...props}
      >
        {children}
        <span
          aria-hidden="true"
          className="ml-auto shrink-0 font-display text-[1.4rem] leading-none font-semibold text-ink-2 transition-transform duration-150 group-data-panel-open:rotate-45"
        >
          +
        </span>
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
      <div className="px-4 pt-1 pb-4">{children}</div>
    </AccordionPrimitive.Panel>
  )
}

export { AccordionRoot, AccordionItem, AccordionTrigger, AccordionContent }

import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1.5 rounded-[3px] px-2 py-[.15rem] font-display text-[.7rem] font-semibold tracking-[.1em] whitespace-nowrap uppercase",
  {
    variants: {
      variant: {
        signal: "bg-signal-soft text-signal-ink",
        ok: "bg-ok-soft text-ok",
        late: "bg-late-soft text-late",
        mute: "border border-line bg-background text-ink-2",
        accent: "border border-line bg-background text-ink-2",
        warning: "bg-signal-soft text-signal-ink",
        neutral: "border border-line bg-background text-ink-2",
      },
    },
    defaultVariants: {
      variant: "signal",
    },
  }
)

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant, className }))}
      {...props}
    />
  )
}

export { Badge, badgeVariants }

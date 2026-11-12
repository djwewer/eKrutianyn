import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center min-h-[2.6rem] rounded-[4px] border-2 border-transparent bg-clip-padding font-display text-[.86rem] font-semibold tracking-[.07em] uppercase whitespace-nowrap transition-all select-none active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "border-navy bg-primary text-primary-foreground hover:bg-primary/90",
        outline:
          "border-line bg-paper text-foreground hover:border-navy aria-expanded:border-navy",
        secondary:
          "border-line bg-paper text-foreground hover:border-navy aria-expanded:border-navy",
        ghost:
          "bg-transparent text-foreground hover:bg-muted aria-expanded:bg-muted",
        destructive:
          "border-late-soft bg-transparent text-late hover:border-late",
        link: "min-h-0 text-primary underline-offset-4 hover:underline",
        signal: "border-signal bg-signal text-white hover:bg-signal/90 dark:text-navy-ink",
      },
      size: {
        default:
          "gap-1.5 px-4 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "min-h-6 h-6 gap-1 rounded-[4px] px-2 text-[.7rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "min-h-[2.1rem] gap-1 rounded-[4px] px-[.7rem] text-[.76rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "min-h-11 gap-1.5 px-5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-[2.6rem] min-h-0 px-0",
        "icon-xs":
          "size-6 min-h-0 rounded-[4px] px-0 in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-[2.1rem] min-h-0 rounded-[4px] px-0 in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-11 min-h-0 px-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }

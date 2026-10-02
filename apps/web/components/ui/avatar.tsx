import { cn } from "@/lib/utils"

function Avatar({
  initials,
  className,
  ...props
}: React.ComponentProps<"div"> & { initials: string }) {
  return (
    <div
      data-slot="avatar"
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent",
        className
      )}
      {...props}
    >
      {initials}
    </div>
  )
}

export { Avatar }

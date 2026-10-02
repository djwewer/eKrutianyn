import { cn } from "@/lib/utils"
import { Avatar } from "@/components/ui/avatar"

function RowList({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="row-list"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function Row({
  initials,
  title,
  subtitle,
  children,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  initials: string
  title: string
  subtitle?: string
}) {
  return (
    <div
      data-slot="row"
      className={cn(
        "flex items-center gap-3.5 rounded-md border border-transparent bg-muted p-3 transition-colors hover:border-accent",
        className
      )}
      {...props}
    >
      <Avatar initials={initials} aria-hidden="true" />
      <div className="flex min-w-0 flex-grow flex-col gap-px">
        <span className="text-sm font-medium">{title}</span>
        {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
      </div>
      {children}
    </div>
  )
}

export { RowList, Row }

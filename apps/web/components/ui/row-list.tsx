import { cn } from "@/lib/utils"
import { Avatar } from "@/components/ui/avatar"

function RowList({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="row-list"
      className={cn("flex flex-col overflow-hidden rounded-[6px] [&_a:focus-visible]:outline-offset-[-3px] border border-line bg-paper", className)}
      {...props}
    />
  )
}

function Row({
  initials,
  photoUrl,
  title,
  subtitle,
  children,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  initials: string
  photoUrl?: string | null
  title: string
  subtitle?: string
}) {
  return (
    <div
      data-slot="row"
      className={cn(
        "flex items-center gap-[.8rem] border-b border-dashed border-line px-[.9rem] py-[.65rem] transition-colors last:border-b-0 hover:bg-sky-soft",
        className
      )}
      {...props}
    >
      <Avatar initials={initials} photoUrl={photoUrl} aria-hidden="true" />
      <div className="flex min-w-0 flex-grow flex-col gap-px">
        <span className="text-base leading-tight font-bold">{title}</span>
        {subtitle && <span className="text-[.82rem] text-ink-2">{subtitle}</span>}
      </div>
      {children}
    </div>
  )
}

export { RowList, Row }

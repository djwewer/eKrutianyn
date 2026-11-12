import { cn } from "@/lib/utils"

function ProgressBar({
  value,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & { value: number }) {
  const percent = Math.max(0, Math.min(100, value))
  return (
    <div
      data-slot="progress-bar"
      className={cn("h-2 overflow-hidden rounded-full border border-line bg-background", className)}
      {...props}
    >
      <i className="block h-full bg-sky" style={{ width: `${percent}%` }} />
    </div>
  )
}

export { ProgressBar }

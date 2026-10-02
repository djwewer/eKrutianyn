import * as React from "react"
import { cn } from "@/lib/utils"

function Avatar({
  initials,
  photoUrl,
  className,
  ...props
}: React.ComponentProps<"div"> & { initials: string; photoUrl?: string | null }) {
  const [imageFailed, setImageFailed] = React.useState(false)

  return (
    <div
      data-slot="avatar"
      className={cn(
        "flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent-soft text-xs font-bold text-accent-text",
        className
      )}
      {...props}
    >
      {photoUrl && !imageFailed ? (
        <img
          src={photoUrl}
          alt={initials}
          className="size-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        initials
      )}
    </div>
  )
}

export { Avatar }

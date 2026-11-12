import * as React from "react"
import { cn } from "@/lib/utils"

function Avatar({
  initials,
  photoUrl,
  className,
  ...props
}: React.ComponentProps<"div"> & { initials: string; photoUrl?: string | null }) {
  const [imageFailed, setImageFailed] = React.useState(false)
  const [lastPhotoUrl, setLastPhotoUrl] = React.useState(photoUrl)

  if (photoUrl !== lastPhotoUrl) {
    setLastPhotoUrl(photoUrl)
    setImageFailed(false)
  }

  return (
    <div
      data-slot="avatar"
      className={cn(
        "flex size-[2.4rem] shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-line bg-background font-display text-[.78rem] font-semibold tracking-[.03em] text-foreground",
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

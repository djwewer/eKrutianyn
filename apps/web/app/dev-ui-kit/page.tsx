// Internal test scaffold for the Project 1 design-system components.
// Not linked from app navigation, not a real page — Project 2 deletes or
// repurposes this once real pages render these components directly.
import { Badge } from "@/components/ui/badge"
import { Avatar } from "@/components/ui/avatar"

export default function DevUiKitPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-10 p-8">
      <section aria-labelledby="badge-heading">
        <h2 id="badge-heading" className="mb-3 font-heading text-lg font-semibold">
          Badge
        </h2>
        <div className="flex flex-wrap gap-2">
          <Badge variant="accent">Активний</Badge>
          <Badge variant="warning">Вакансія</Badge>
          <Badge variant="neutral">Гуртковий</Badge>
        </div>
      </section>
      <section aria-labelledby="avatar-heading">
        <h2 id="avatar-heading" className="mb-3 font-heading text-lg font-semibold">
          Avatar
        </h2>
        <div className="flex gap-2">
          <Avatar initials="ТШ" />
          <Avatar initials="МК" />
        </div>
      </section>
    </main>
  )
}

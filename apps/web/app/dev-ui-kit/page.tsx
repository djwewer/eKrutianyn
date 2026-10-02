// Internal test scaffold for the Project 1 design-system components.
// Not linked from app navigation, not a real page — Project 2 deletes or
// repurposes this once real pages render these components directly.
import { Badge } from "@/components/ui/badge"
import { Avatar } from "@/components/ui/avatar"
import {
  AccordionRoot,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion"

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
      <section aria-labelledby="accordion-heading">
        <h2 id="accordion-heading" className="mb-3 font-heading text-lg font-semibold">
          Accordion (with nesting)
        </h2>
        <AccordionRoot>
          <AccordionItem value="info">
            <AccordionTrigger>Інформація по куреню</AccordionTrigger>
            <AccordionContent>Назва, номер, пробна програма.</AccordionContent>
          </AccordionItem>
          <AccordionItem value="hurtky">
            <AccordionTrigger>Гуртки</AccordionTrigger>
            <AccordionContent>
              <AccordionRoot>
                <AccordionItem value="orlyky">
                  <AccordionTrigger>Орлики</AccordionTrigger>
                  <AccordionContent>Тарас Шевчук — Гуртковий</AccordionContent>
                </AccordionItem>
                <AccordionItem value="sokoly">
                  <AccordionTrigger>Соколи</AccordionTrigger>
                  <AccordionContent>Соломія Гнатюк — Гуртковий</AccordionContent>
                </AccordionItem>
              </AccordionRoot>
            </AccordionContent>
          </AccordionItem>
        </AccordionRoot>
      </section>
    </main>
  )
}

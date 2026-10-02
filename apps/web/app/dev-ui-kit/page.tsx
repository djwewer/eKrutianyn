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
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { ThemeToggle } from "@/components/ui/theme-toggle"

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
      <section aria-labelledby="select-heading">
        <h2 id="select-heading" className="mb-3 font-heading text-lg font-semibold">
          Select
        </h2>
        <Select
          defaultValue="orlyky"
          items={{ orlyky: "Орлики", sokoly: "Соколи", vovky: "Вовки" }}
        >
          <SelectTrigger className="w-56" aria-label="Гурток">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="orlyky">Орлики</SelectItem>
            <SelectItem value="sokoly">Соколи</SelectItem>
            <SelectItem value="vovky">Вовки</SelectItem>
          </SelectContent>
        </Select>
      </section>
      <section aria-labelledby="theme-toggle-heading">
        <h2 id="theme-toggle-heading" className="mb-3 font-heading text-lg font-semibold">
          Theme toggle
        </h2>
        <ThemeToggle />
      </section>
    </main>
  )
}

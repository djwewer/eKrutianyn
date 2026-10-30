import type { SkillRequirement } from '@/lib/types';

/** Requirements keep the source numbering in their text, so the list itself has no markers. */
export function SkillRequirementList({ requirements }: { requirements: SkillRequirement[] }) {
  return (
    <ul className="space-y-1.5">
      {requirements.map((requirement, index) => (
        <li key={index}>
          <p>{requirement.text}</p>
          {requirement.items && requirement.items.length > 0 && (
            <ul className="mt-1 space-y-0.5 pl-4 text-muted-foreground">
              {requirement.items.map((item, itemIndex) => (
                <li key={itemIndex}>{item}</li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

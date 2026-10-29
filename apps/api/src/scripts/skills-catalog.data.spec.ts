import { SkillGroup } from '@prisma/client';
import { SKILLS_CATALOG, SkillData } from './skills-catalog.data';

/** [skills, skill×level entries] per group after the manual clean-up; a row is added with each group. */
const EXPECTED_COUNTS: Partial<Record<SkillGroup, [number, number]>> = {
  PRACTICAL: [9, 9],
  FIRST_AID: [2, 3],
  NATURE: [5, 7],
};

const ALLOWED_NOTES = ['Виконати вимоги А або Б.', 'нова вмілість'];

function skill(name: string): SkillData {
  const found = SKILLS_CATALOG.find((s) => s.name === name);
  if (!found) throw new Error(`Вмілості «${name}» немає в каталозі`);
  return found;
}
const levelsOf = (name: string) => skill(name).levels.map((l) => l.level);
const requirementsOf = (name: string, level: number) => skill(name).levels.find((l) => l.level === level)!.requirements;
const allTexts = () =>
  SKILLS_CATALOG.flatMap((s) => [
    s.name,
    ...s.levels.flatMap((l) => [...(l.note ? [l.note] : []), ...l.requirements.flatMap((r) => [r.text, ...(r.items ?? [])])]),
  ]);

describe('SKILLS_CATALOG — structure', () => {
  it('has unique skill names across all groups', () => {
    const names = SKILLS_CATALOG.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('uses only levels 1–3, each at most once per skill, in ascending order', () => {
    for (const s of SKILLS_CATALOG) {
      const levels = s.levels.map((l) => l.level);
      expect(levels.length).toBeGreaterThan(0);
      expect(levels.every((l) => [1, 2, 3].includes(l))).toBe(true);
      expect(levels).toEqual([...new Set(levels)].sort());
    }
  });

  it('has at least one requirement per level and no empty texts or items', () => {
    for (const s of SKILLS_CATALOG) {
      for (const l of s.levels) {
        expect(l.requirements.length).toBeGreaterThan(0);
        for (const r of l.requirements) {
          expect(r.text.trim()).not.toBe('');
          if (r.items) {
            expect(r.items.length).toBeGreaterThan(0);
            r.items.forEach((item) => expect(item.trim()).not.toBe(''));
          }
        }
      }
    }
  });

  it('has clean text: trimmed, no form feeds, no double spaces, no lost degree sign', () => {
    for (const text of allTexts()) {
      expect(text).toBe(text.trim());
      expect(text).not.toMatch(/\f|\s{2,}/);
      expect(text).not.toContain('1800');
    }
  });

  it('uses only the known level notes', () => {
    for (const s of SKILLS_CATALOG) {
      for (const l of s.levels) {
        if (l.note !== undefined) expect(ALLOWED_NOTES).toContain(l.note);
      }
    }
  });
});

describe('SKILLS_CATALOG — per-group counts', () => {
  it.each(Object.entries(EXPECTED_COUNTS))('group %s has the expected skills and levels', (group, counts) => {
    const inGroup = SKILLS_CATALOG.filter((s) => s.group === group);
    expect([inGroup.length, inGroup.reduce((sum, s) => sum + s.levels.length, 0)]).toEqual(counts);
  });
});

describe('PRACTICAL clean-up', () => {
  it('fixes «Табріництво» and keeps the numbering gap in «Піонірство»', () => {
    expect(levelsOf('Табірництво')).toEqual([1]);
    expect(allTexts().join('\n')).not.toContain('Табріництво');
    expect(requirementsOf('Піонірство', 2).map((r) => r.text.split('.')[0])).toEqual(['1', '2', '3', '4', '5', '7', '8', '9']);
  });

  it('keeps sub-points and prerequisites as text', () => {
    const kartografia = requirementsOf('Картографія', 2);
    expect(kartografia).toHaveLength(5);
    expect(kartografia[0].items).toHaveLength(5);
    expect(requirementsOf('Три пера', 3)[0].text).toBe('1. Здобути вмілості «Одне перо», «Два пера» та «Перша допомога».');
  });
});

describe('FIRST_AID clean-up', () => {
  it('keeps «А або Б» as a note with two requirements, the numbered list belonging to Б', () => {
    expect(levelsOf('Перша допомога')).toEqual([1, 2]);
    const level1 = skill('Перша допомога').levels[0];
    expect(level1.note).toBe('Виконати вимоги А або Б.');
    expect(level1.requirements.map((r) => r.text.slice(0, 2))).toEqual(['А.', 'Б.']);
    expect(level1.requirements[1].items).toHaveLength(13);
    expect(requirementsOf('Водне рятівництво', 3)[0].text).toBe('1. Здобути вмілість з плавання.');
  });
});

describe('NATURE clean-up', () => {
  it('has three levels of «Природознавство», the third a single paragraph', () => {
    expect(levelsOf('Природознавство')).toEqual([1, 2, 3]);
    expect(requirementsOf('Природознавство', 3)).toHaveLength(1);
    expect(requirementsOf('Рибальство', 2)[7].items).toHaveLength(3);
  });
});

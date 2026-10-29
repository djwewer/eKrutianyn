import { SkillGroup } from '@prisma/client';
import { SKILLS_CATALOG, SkillData } from './skills-catalog.data';

/** [skills, skill×level entries] per group after the manual clean-up; a row is added with each group. */
const EXPECTED_COUNTS: Partial<Record<SkillGroup, [number, number]>> = {
  PRACTICAL: [9, 9],
  FIRST_AID: [2, 3],
  NATURE: [5, 7],
  SPORT: [12, 14],
  HOME: [4, 10],
  SPECIAL: [12, 24],
  ARTS: [13, 28],
  AVIATION: [3, 3],
  SEA: [10, 10],
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

describe('SPORT clean-up', () => {
  it('fixes skill names and splits the merged ski-touring level into its own skill', () => {
    const names = SKILLS_CATALOG.map((s) => s.name);
    expect(names).toEqual(expect.arrayContaining(['Альпіністика', 'Водне лещетарство', 'Мандрівне лещетарство']));
    expect(names).not.toEqual(expect.arrayContaining(['Альпіністка']));
    expect(allTexts().join('\n')).not.toMatch(/лещатарство|трасі\.третя/);
    expect(levelsOf('Скелелазіння')).toEqual([2, 3]);
    expect(levelsOf('Лещетарство')).toEqual([2, 3]);
    const skiing3 = requirementsOf('Лещетарство', 3);
    expect(skiing3.map((r) => r.text.split('.')[0])).toEqual(['I', 'II', 'III', 'IV', 'V']);
    expect(JSON.stringify(skiing3)).not.toContain('Лещетарство альпійського стилю');
    expect(skiing3[3].items).toContain('2. Розворот на 180° на місці в обидві сторони.');
    expect(levelsOf('Мандрівне лещетарство')).toEqual([3]);
    expect(requirementsOf('Мандрівне лещетарство', 3)[0].text).toContain('«Лещетарство альпійського стилю»');
    expect(requirementsOf('Мандрівне лещетарство', 3)).toHaveLength(12);
  });
});

describe('HOME clean-up', () => {
  it('merges «Домашня парадність» into «Домашня зарадність» level 2', () => {
    expect(allTexts().join('\n')).not.toContain('парадність');
    expect(levelsOf('Плетіння')).toEqual([1, 2, 3]);
    expect(levelsOf('Шиття')).toEqual([1, 2, 3]);
  });

  it('splits the level 3 merged into «…інструментами.третя проба» off level 2 of «Домашня зарадність»', () => {
    expect(levelsOf('Домашня зарадність')).toEqual([1, 2, 3]);
    expect(allTexts().join('\n')).not.toContain('третя проба');
    expect(requirementsOf('Домашня зарадність', 2)).toHaveLength(5);
    expect(requirementsOf('Домашня зарадність', 2)[4].text).toBe('5. Знати і дотримуватися правил безпеки користування інструментами.');
    expect(requirementsOf('Домашня зарадність', 3)[0].text).toBe('1. Здобути вмілість «Домашня зарадність II».');
    expect(requirementsOf('Домашня зарадність', 3)).toHaveLength(5);
  });
});

describe('SPECIAL clean-up', () => {
  it('has three levels for the six multi-level special-interest skills', () => {
    for (const name of ['Автознавство', 'Астрономія', 'Військовик', 'Провідництво туристів', 'Український амбасадор', 'Фотографування']) {
      expect(levelsOf(name)).toEqual([1, 2, 3]);
    }
  });
});

describe('ARTS clean-up', () => {
  it('fixes «Актороство» and moves the mislabelled woodcarving level from «Скульптура» to «Різьбярство»', () => {
    expect(levelsOf('Акторство')).toEqual([1, 2, 3]);
    expect(allTexts().join('\n')).not.toContain('Актороство');
    expect(levelsOf('Різьбярство')).toEqual([1, 2, 3]);
    expect(requirementsOf('Різьбярство', 3)[0].text).toBe('1. Знати назви мотивів орнаментального різьблення по дереву.');
    expect(levelsOf('Скульптура')).toEqual([2, 3]);
    expect(requirementsOf('Скульптура', 2)[0].text).toContain('історію світової скульптури');
    expect(requirementsOf('Скульптура', 3)[0].text).toContain('історію української скульптури');
  });
});

describe('SKILLS_CATALOG — completeness', () => {
  it('covers all 9 groups', () => {
    expect(new Set(SKILLS_CATALOG.map((s) => s.group))).toEqual(new Set(Object.values(SkillGroup)));
  });

  it('has 70 skills and 108 skill×level entries', () => {
    expect(SKILLS_CATALOG).toHaveLength(70);
    expect(SKILLS_CATALOG.reduce((sum, s) => sum + s.levels.length, 0)).toBe(108);
  });
});

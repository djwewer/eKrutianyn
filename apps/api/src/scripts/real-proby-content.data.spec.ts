import { REAL_PROBY_CONTENT } from './real-proby-content.data';

describe('REAL_PROBY_CONTENT', () => {
  it('has 3 stages in order 1, 2, 3', () => {
    expect(REAL_PROBY_CONTENT).toHaveLength(3);
    expect(REAL_PROBY_CONTENT.map((s) => s.order)).toEqual([1, 2, 3]);
  });

  it('has the expected stage names', () => {
    expect(REAL_PROBY_CONTENT.map((s) => s.name)).toEqual([
      'Проба прихильника (Відзнака прихильника)',
      'Проба учасника (Скобине крило)',
      'Проба розвідувача (Скобиний хват)',
    ]);
  });

  it('Stage 1 has exactly 1 category with 13 points', () => {
    const stage = REAL_PROBY_CONTENT[0];
    expect(stage.categories).toHaveLength(1);
    expect(stage.categories[0].name).toBe('Точки');
    expect(stage.categories[0].points).toHaveLength(13);
  });

  it('Stage 2 has exactly 8 categories totalling 59 points', () => {
    const stage = REAL_PROBY_CONTENT[1];
    expect(stage.categories).toHaveLength(8);
    expect(stage.categories.map((c) => c.name)).toEqual([
      "А. Три головні обов'язки",
      'Б. Пластова Ідея',
      'В. Пластова організація',
      'Г. Пластові заняття',
      'Ґ. Життя в природі',
      'Д. Життєва зарадність',
      'Е. Тіловиховання',
      'Є. Вмілості',
    ]);
    expect(stage.categories.map((c) => c.points.length)).toEqual([8, 6, 3, 8, 8, 15, 6, 5]);
    const total = stage.categories.reduce((sum, c) => sum + c.points.length, 0);
    expect(total).toBe(59);
  });

  it('Stage 3 has exactly 7 categories totalling 58 points', () => {
    const stage = REAL_PROBY_CONTENT[2];
    expect(stage.categories).toHaveLength(7);
    expect(stage.categories.map((c) => c.name)).toEqual([
      "А. Три головні обов'язки",
      'Б. Пластова Ідея та організація',
      'В. Пластова організація',
      'Г. Пластові заняття',
      'Д. Тіловиховання',
      'Е. Вмілості',
      'Ґ. Життєва зарадність',
    ]);
    expect(stage.categories.map((c) => c.points.length)).toEqual([8, 1, 4, 5, 6, 5, 29]);
    const total = stage.categories.reduce((sum, c) => sum + c.points.length, 0);
    expect(total).toBe(58);
  });

  it('has 130 points in total across all stages', () => {
    const total = REAL_PROBY_CONTENT.reduce(
      (sum, stage) => sum + stage.categories.reduce((s, c) => s + c.points.length, 0),
      0,
    );
    expect(total).toBe(130);
  });
});

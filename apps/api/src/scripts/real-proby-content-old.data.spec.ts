import { REAL_PROBY_CONTENT_OLD } from './real-proby-content-old.data';

describe('REAL_PROBY_CONTENT_OLD', () => {
  it('has 3 stages in order 1, 2, 3', () => {
    expect(REAL_PROBY_CONTENT_OLD).toHaveLength(3);
    expect(REAL_PROBY_CONTENT_OLD.map((s) => s.order)).toEqual([1, 2, 3]);
  });

  it('has the expected stage names', () => {
    expect(REAL_PROBY_CONTENT_OLD.map((s) => s.name)).toEqual([
      'Проба прихильника (Відзнака прихильника)',
      'Проба учасника (Скобине крило)',
      'Проба розвідувача (Скобиний хват)',
    ]);
  });

  it('Stage 1 has exactly 1 category with 13 points', () => {
    const stage = REAL_PROBY_CONTENT_OLD[0];
    expect(stage.categories).toHaveLength(1);
    expect(stage.categories[0].name).toBe('Точки');
    expect(stage.categories[0].points).toHaveLength(13);
  });

  it('Stage 2 has exactly 8 categories totalling 53 points', () => {
    const stage = REAL_PROBY_CONTENT_OLD[1];
    expect(stage.categories).toHaveLength(8);
    expect(stage.categories.map((c) => c.points.length)).toEqual([11, 7, 4, 6, 10, 9, 3, 3]);
    const total = stage.categories.reduce((sum, c) => sum + c.points.length, 0);
    expect(total).toBe(53);
  });

  it('Stage 3 has exactly 7 categories totalling 38 points, with the corrected Ґ letter', () => {
    const stage = REAL_PROBY_CONTENT_OLD[2];
    expect(stage.categories).toHaveLength(7);
    expect(stage.categories.map((c) => c.name)).toEqual([
      'А Три головні обов\'язки пластуна',
      'Б Пластова ідея та організація',
      'В Пластові заняття',
      'Г Життя в природі',
      'Ґ Життєва зарадність',
      'Д Тіловиховання',
      'Е Юнацькі вмілості',
    ]);
    expect(stage.categories.map((c) => c.points.length)).toEqual([10, 10, 3, 7, 5, 2, 1]);
    const total = stage.categories.reduce((sum, c) => sum + c.points.length, 0);
    expect(total).toBe(38);
  });

  it('has 104 points in total across all stages', () => {
    const total = REAL_PROBY_CONTENT_OLD.reduce(
      (sum, stage) => sum + stage.categories.reduce((s, c) => s + c.points.length, 0),
      0,
    );
    expect(total).toBe(104);
  });
});

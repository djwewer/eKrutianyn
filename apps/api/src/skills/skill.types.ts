/** One requirement of a skill level, numbered as in the source; `items` are its sub-points (а), б)… or «–» lines). */
export interface SkillRequirement {
  text: string;
  items?: string[];
}

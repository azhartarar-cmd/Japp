import { Level, LevelData, parseLevel } from '../game/level';
import l1 from './01-first-steps.json';
import l2 from './02-cold-iron.json';
import l3 from './03-drowned-vault.json';

/** Add new levels here (in play order). See README "Adding a level". */
export const LEVEL_DATA: LevelData[] = [l1, l2, l3] as LevelData[];

export const LEVELS: Level[] = LEVEL_DATA.map(parseLevel);

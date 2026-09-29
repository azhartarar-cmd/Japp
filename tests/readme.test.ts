import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { LevelData, parseLevel } from '../src/game/level';

it('the level example in the README parses', () => {
  const md = readFileSync('README.md', 'utf8');
  const json = /```json\n([\s\S]*?)```/.exec(md)?.[1];
  expect(json).toBeTruthy();
  const level = parseLevel(JSON.parse(json!) as LevelData);
  expect(level.guards).toHaveLength(2);
});

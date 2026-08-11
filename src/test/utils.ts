import { expect } from "vitest";
import { Mob, MobSpec } from "../types";
import { LineOfSight } from "../lineOfSight";

export const createMobSpec = (x: number, y: number, type: number): MobSpec => [
  x,
  y,
  type,
];

export const checkMove = (
  los: LineOfSight,
  // note: this NPC gets MUTATED so it is expected not to be what is passed out of _getMobs()
  mutableNpc: Mob,
  x: number,
  y: number,
  attacked: number | false = false,
) => {
  mutableNpc[0] = x;
  mutableNpc[1] = y;
  if (!attacked) {
    mutableNpc[5]--;
  } else {
    mutableNpc[5] = attacked;
  }
  expect(los._getMobs()).toContainEqual(mutableNpc);
};

export const checkPosition = (npc: Mob, x: number, y: number) => {
  expect(npc[0]).toBe(x);
  expect(npc[1]).toBe(y);
};

export const checkIdleStep = (los: LineOfSight, npc: Mob) => {
  npc[5]--;
  expect(los._getMobs()).toContainEqual(npc);
};

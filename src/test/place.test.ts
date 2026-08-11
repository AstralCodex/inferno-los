import { beforeEach, describe, expect, test } from "vitest";
import { LineOfSight } from "../lineOfSight";
import { NPC_TYPES } from "../constants";

describe("placement tests", () => {
  let los: LineOfSight;

  beforeEach(() => {
    los = new LineOfSight();
  });

  test("empty state", () => {
    expect(los._getMobs()).toEqual([]);
  });

  test("disallow placing mode 0 (player)", () => {
    los._setSelected([1, 1], NPC_TYPES.PLAYER);
    los.place();
    expect(los._getMobs()).toEqual([]);
  });

  test("place single npc", () => {
    los._setSelected([1, 1], NPC_TYPES.BAT);
    los.place();
    expect(los._getMobs()).toEqual([[1, 1, 1, 1, 1, 0]]);
  });

  test("disallow placing npcs on top of each other", () => {
    los._setSelected([1, 1], NPC_TYPES.BAT);
    los.place();
    los._setSelected([1, 1], NPC_TYPES.BAT);
    los.place();
    expect(los._getMobs()).toEqual([[1, 1, 1, 1, 1, 0]]);
  });

  test("mobs are sorted by descending type", () => {
    los._setSelected([1, 1], NPC_TYPES.BAT);
    los.place();
    los._setSelected([10, 10], NPC_TYPES.MAGER);
    los.place();
    los._setSelected([20, 20], NPC_TYPES.RANGER);
    los.place();
    expect(los._getMobs().map((m) => m[2])).toEqual([
      NPC_TYPES.MAGER,
      NPC_TYPES.RANGER,
      NPC_TYPES.BAT,
    ]);
  });
});

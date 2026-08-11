import { beforeEach, describe, expect, test } from "vitest";
import { LineOfSight } from "../lineOfSight";
import { FIRST_DECORATIVE_TYPE, NPC_TYPES, SPAWNS, WAVES } from "../constants";

describe("melee dig", () => {
  let los: LineOfSight;

  beforeEach(() => {
    los = new LineOfSight();
    los._setSelected([13, 20], NPC_TYPES.MELEE);
    los.place();
  });

  test("digs to the south-west of the player when free", () => {
    los._setSelected([16, 5], NPC_TYPES.PLAYER);
    los.meleeDig();
    const melee = los._getMobs()[0];
    expect([melee[0], melee[1]]).toEqual([13, 8]);
  });

  test("falls back to another position when blocked by a pillar", () => {
    los._setSelected([2, 12], NPC_TYPES.PLAYER);
    los.meleeDig();
    const melee = los._getMobs()[0];
    expect([melee[0], melee[1]]).toEqual([2, 15]);
  });
});

describe("wave loading", () => {
  let los: LineOfSight;

  beforeEach(() => {
    los = new LineOfSight();
  });

  test("loads a wave with its nibbler group and npcs on spawn zones", () => {
    los.loadWave(4); // wave 4 = single blob
    const mobs = los._getMobs();
    expect(mobs).toHaveLength(2);
    const decorative = mobs.filter((m) => m[2] >= FIRST_DECORATIVE_TYPE);
    expect(decorative).toHaveLength(1);
    const blobs = mobs.filter((m) => m[2] === NPC_TYPES.BLOB_1);
    expect(blobs).toHaveLength(1);
    expect(SPAWNS).toContainEqual([blobs[0][0], blobs[0][1]]);
  });

  test("loads wave 66 with two magers on distinct spawns", () => {
    los.loadWave(66);
    const magers = los._getMobs().filter((m) => m[2] === NPC_TYPES.MAGER);
    expect(magers).toHaveLength(2);
    expect([magers[0][0], magers[0][1]]).not.toEqual([
      magers[1][0],
      magers[1][1],
    ]);
  });

  test("replaces the previous wave", () => {
    los.loadWave(66);
    los.loadWave(1);
    const mobs = los._getMobs();
    expect(mobs.filter((m) => m[2] === NPC_TYPES.MAGER)).toHaveLength(0);
    expect(mobs.filter((m) => m[2] === NPC_TYPES.BAT)).toHaveLength(1);
  });

  test("ignores invalid wave numbers", () => {
    los.loadWave(NaN);
    los.loadWave(0);
    los.loadWave(WAVES.length + 1);
    expect(los._getMobs()).toHaveLength(0);
  });
});

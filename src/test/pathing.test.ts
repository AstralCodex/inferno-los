import { beforeAll, describe, expect, test } from "vitest";
import { LineOfSight } from "../lineOfSight";
import { Mob } from "../types";
import { NPC_TYPES } from "../constants";
import { checkIdleStep, checkMove } from "./utils";

describe("nibbler pathing with pillars standing", () => {
  let los: LineOfSight;

  const nibbler: Mob = [5, 5, NPC_TYPES.NIBBLER, 5, 5, 0];
  beforeAll(() => {
    // this is a sequential test, so only reset state at the start
    los = new LineOfSight();
    los._setSelected([nibbler[0], nibbler[1]], nibbler[2]);
    los.place();
    los._setSelected([5, 8], NPC_TYPES.PLAYER);
  });

  test("nibbler heads for the nearest pillar, not the player", () => {
    los.step();
    checkMove(los, nibbler, 4, 6);
    los.step();
    checkMove(los, nibbler, 3, 7);
  });

  test("nibbler stops beside the pillar and never attacks the player", () => {
    los.step();
    checkIdleStep(los, nibbler);
    expect(los.tape.every((line) => line.every((v) => (v & 0xff) === 0))).toBe(
      true,
    );
  });
});

describe("nibbler pathing with no pillars", () => {
  let los: LineOfSight;

  const nibbler: Mob = [5, 5, NPC_TYPES.NIBBLER, 5, 5, 0];
  beforeAll(() => {
    los = new LineOfSight();
    los.togglePillar(0);
    los.togglePillar(1);
    los.togglePillar(2);
    los._setSelected([nibbler[0], nibbler[1]], nibbler[2]);
    los.place();
  });

  test("nibbler paths towards the player", () => {
    los._setSelected([5, 8], NPC_TYPES.PLAYER);
    los.step();
    checkMove(los, nibbler, 5, 6);
  });

  test("nibbler attacks once in melee range", () => {
    los.step();
    checkMove(los, nibbler, 5, 7, 4);
  });

  test("nibbler waits out its cooldown", () => {
    los.step();
    checkIdleStep(los, nibbler);
  });
});

describe("pillar line of sight", () => {
  let los: LineOfSight;

  const ranger: Mob = [0, 12, NPC_TYPES.RANGER, 0, 12, 0];
  beforeAll(() => {
    los = new LineOfSight();
    los._setSelected([ranger[0], ranger[1]], ranger[2]);
    los.place();
  });

  test("west pillar blocks line of sight", () => {
    los._setSelected([0, 4], NPC_TYPES.PLAYER);
    los.step();
    // the ranger cannot see or path around the pillar from here
    checkIdleStep(los, ranger);
  });

  test("removing the west pillar restores line of sight", () => {
    los.togglePillar(0);
    los.step();
    checkMove(los, ranger, 0, 12, 4);
  });
});

describe("nibbler collision rules", () => {
  let los: LineOfSight;

  const melee: Mob = [10, 10, NPC_TYPES.MELEE, 10, 10, 0];
  const nibbler: Mob = [12, 12, NPC_TYPES.NIBBLER, 12, 12, 0];
  beforeAll(() => {
    los = new LineOfSight();
    // no pillars, so the nibbler hunts the player
    los.togglePillar(0);
    los.togglePillar(1);
    los.togglePillar(2);
    los._setSelected([melee[0], melee[1]], melee[2]);
    los.place();
    los._setSelected([nibbler[0], nibbler[1]], nibbler[2]);
    los.place();
  });

  test("meleer attacks the adjacent player while the nibbler paths", () => {
    los._setSelected([9, 8], NPC_TYPES.PLAYER);
    los.step();
    checkMove(los, melee, 10, 10, 4);
    checkMove(los, nibbler, 11, 11);
  });

  test("nibbler can walk under the meleer", () => {
    los.step();
    checkIdleStep(los, melee);
    checkMove(los, nibbler, 10, 10);
  });
});


describe("melee dig replay", () => {
  test("a replay reproduces a recorded dig", () => {
    // record: melee walks a tick, digs to the player, walks another tick
    const rec = new LineOfSight();
    rec._setSelected([20, 20], NPC_TYPES.MELEE);
    rec.place();
    rec._setSelected([16, 5], NPC_TYPES.PLAYER);
    rec.step();
    rec.meleeDig();
    rec.step();
    expect(rec.digTicks).to.deep.equal([1]);
    const recorded = rec._getMobs()[0];

    // replay from the same start state using the recorded player path
    // and dig ticks
    const rep = new LineOfSight();
    rep._setSelected([20, 20], NPC_TYPES.MELEE);
    rep.place();
    rep.mode = NPC_TYPES.PLAYER;
    rep.replay = [...rec.playerTape];
    rep.digTicks = [...rec.digTicks];
    rep.replayTick = 0;
    rep.selected = rep.replay[0];
    rep.step();
    rep.step();
    const replayed = rep._getMobs()[0];
    expect([replayed[0], replayed[1]]).to.deep.equal([
      recorded[0],
      recorded[1],
    ]);
  });

  test("without the dig ticks the replay diverges", () => {
    const rec = new LineOfSight();
    rec._setSelected([20, 20], NPC_TYPES.MELEE);
    rec.place();
    rec._setSelected([16, 5], NPC_TYPES.PLAYER);
    rec.step();
    rec.meleeDig();
    rec.step();
    const recorded = rec._getMobs()[0];

    const rep = new LineOfSight();
    rep._setSelected([20, 20], NPC_TYPES.MELEE);
    rep.place();
    rep.mode = NPC_TYPES.PLAYER;
    rep.replay = [...rec.playerTape];
    rep.replayTick = 0;
    rep.selected = rep.replay[0];
    rep.step();
    rep.step();
    const replayed = rep._getMobs()[0];
    expect([replayed[0], replayed[1]]).not.to.deep.equal([
      recorded[0],
      recorded[1],
    ]);
  });
});

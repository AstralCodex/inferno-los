import { describe, expect, test } from "vitest";
import { createMobSpec } from "./utils";
import { ReplayData } from "../types";
import {
  convertMobSpecToMob,
  decodeURL,
  getReplayURL,
  getSpawnUrl,
} from "../utils";

const ALL_PILLARS = [true, true, true];

describe("url tests", () => {
  test("empty spawn url", () => {
    expect(getSpawnUrl([])).toBe("http://localhost:3000/?");
  });

  test("single mob spawn url", () => {
    expect(getSpawnUrl([createMobSpec(1, 5, 1)])).toBe(
      "http://localhost:3000/?01051.",
    );
  });

  test("multiple mob spawn url", () => {
    expect(getSpawnUrl([createMobSpec(1, 5, 1), createMobSpec(22, 5, 7)])).toBe(
      "http://localhost:3000/?01051.22057.",
    );
  });

  test("spawn url with disabled pillars", () => {
    expect(getSpawnUrl([], [false, true, false])).toBe(
      "http://localhost:3000/?noWe.noS.",
    );
  });

  test("spawn url with north view", () => {
    expect(getSpawnUrl([], ALL_PILLARS, false)).toBe(
      "http://localhost:3000/?degeN.",
    );
  });

  describe("legacy URL decoding", () => {
    test("decoding empty url", () => {
      expect(decodeURL(new URL("http://localhost:3000/?"))).to.deep.equal({
        mobs: [],
        pillars: [true, true, true],
        south: true,
        playerCoordinates: null,
        isFromWaveStart: false,
        isReplay: false,
      });
    });

    test("decoding mobs and flags", () => {
      const decoded = decodeURL(
        new URL("http://localhost:3000/?01051.22057.noWe.degeN"),
      );
      expect(decoded.mobs).to.deep.equal([
        [1, 5, 1, 1, 5, 0],
        [22, 5, 7, 22, 5, 0],
      ]);
      expect(decoded.pillars).to.deep.equal([false, true, true]);
      expect(decoded.south).toBe(false);
    });

    test("decoding tolerates double dots (old tool URLs)", () => {
      const decoded = decodeURL(new URL("http://localhost:3000/?01051..noWe"));
      expect(decoded.mobs).to.deep.equal([[1, 5, 1, 1, 5, 0]]);
      expect(decoded.pillars).to.deep.equal([false, true, true]);
    });

    test("decoding two-digit npc types (nibbler groups)", () => {
      const decoded = decodeURL(new URL("http://localhost:3000/?030910."));
      expect(decoded.mobs).to.deep.equal([[3, 9, 10, 3, 9, 0]]);
    });

    test("decoding InfernoStats plugin named parameters", () => {
      // wave 62 example from the plugin's own docs
      const decoded = decodeURL(
        new URL(
          "http://localhost:3000/?bat=[[1,5],[3,11]]&blob=[[16,17]]&melee=[[23,12]]&ranger=[[1,28]]&mager=[[15,28]]&copyable",
        ),
      );
      expect(decoded.mobs).to.deep.equal([
        [1, 5, 1, 1, 5, 0],
        [3, 11, 1, 3, 11, 0],
        [16, 17, 2, 16, 17, 0],
        [23, 12, 5, 23, 12, 0],
        [1, 28, 6, 1, 28, 0],
        [15, 28, 7, 15, 28, 0],
      ]);
      expect(decoded.pillars).to.deep.equal([true, true, true]);
    });

    test("malformed named parameters are ignored", () => {
      const decoded = decodeURL(
        new URL("http://localhost:3000/?bat=notjson&mager=[[5,23]]"),
      );
      expect(decoded.mobs).to.deep.equal([[5, 23, 7, 5, 23, 0]]);
    });

    test("nibbler pillar assignment round-trips", () => {
      expect(getSpawnUrl([[8, 11, 4, 0]])).toBe(
        "http://localhost:3000/?08114w.",
      );
      const decoded = decodeURL(new URL("http://localhost:3000/?08114w."));
      expect(decoded.mobs).to.deep.equal([[8, 11, 4, 8, 11, 0, 0]]);
    });
  });

  describe("replay encoding tests", () => {
    test("empty replay url", () => {
      const emptyReplay: ReplayData = {
        mobSpecs: [],
        playerPositions: [[0, 0]],
      };
      expect(getReplayURL(emptyReplay, ALL_PILLARS, true)).toBe(
        "http://localhost:3000/?#0",
      );
    });

    test("single mob replay url", () => {
      const replay: ReplayData = {
        mobSpecs: [createMobSpec(1, 5, 1)],
        playerPositions: [[0, 0]],
      };
      expect(getReplayURL(replay, ALL_PILLARS, true)).toBe(
        "http://localhost:3000/?01051.#0",
      );
    });

    test("replay url with moving player, with idle ticks", () => {
      // testing run-length encoding
      const replay: ReplayData = {
        mobSpecs: [createMobSpec(1, 5, 1)],
        playerPositions: [
          [0, 0],
          [1, 1],
          [1, 1],
          [2, 2],
          [2, 2],
          [2, 2],
        ],
      };
      expect(getReplayURL(replay, ALL_PILLARS, true)).toBe(
        "http://localhost:3000/?01051.#0.257x2.514x3",
      );
    });

    test("replay url with fromWaveStart flag", () => {
      const replay: ReplayData = {
        mobSpecs: [createMobSpec(1, 5, 1)],
        playerPositions: [[0, 0]],
      };
      expect(getReplayURL(replay, ALL_PILLARS, true, true)).toBe(
        "http://localhost:3000/?01051.#0_ws",
      );
    });
  });

  describe("replay decoding tests", () => {
    test("decoding simple replay URL", () => {
      const decoded = decodeURL(
        new URL("http://localhost:3000/?11092.#2311.2055"),
      );
      expect(decoded.mobs).to.deep.equal([[11, 9, 2, 11, 9, 0]]);
      expect(decoded.playerCoordinates).to.deep.equal([
        [7, 9],
        [7, 8],
      ]);
      expect(decoded.isReplay).toBe(true);
      expect(decoded.isFromWaveStart).toBe(false);
    });

    test("decoding wave start URL", () => {
      const decoded = decodeURL(
        new URL("http://localhost:3000/?11092.#2311.2055_ws"),
      );
      expect(decoded.isReplay).toBe(true);
      expect(decoded.isFromWaveStart).toBe(true);
    });

    test("single player position is not a replay", () => {
      const decoded = decodeURL(new URL("http://localhost:3000/?11092.#2311"));
      expect(decoded.playerCoordinates).to.deep.equal([[7, 9]]);
      expect(decoded.isReplay).toBe(false);
    });
  });

  describe("codec symmetry tests", () => {
    test("mobs and player positions round-trip", () => {
      const replay: ReplayData = {
        mobSpecs: [
          createMobSpec(1, 2, 3),
          createMobSpec(4, 5, 6),
          createMobSpec(7, 8, 7),
        ],
        playerPositions: [
          [23, 12],
          [24, 12],
          [25, 12],
        ],
      };
      const url = getReplayURL(replay, ALL_PILLARS, true);
      const decoded = decodeURL(new URL(url));
      expect(decoded.mobs).to.deep.equal(
        replay.mobSpecs.map(convertMobSpecToMob),
      );
      expect(decoded.playerCoordinates).to.deep.equal(replay.playerPositions);
    });

    test("pillar and orientation flags round-trip", () => {
      const replay: ReplayData = {
        mobSpecs: [createMobSpec(1, 2, 3)],
        playerPositions: [
          [23, 12],
          [24, 12],
        ],
      };
      const url = getReplayURL(replay, [true, false, true], false);
      const decoded = decodeURL(new URL(url));
      expect(decoded.pillars).to.deep.equal([true, false, true]);
      expect(decoded.south).toBe(false);
      expect(decoded.isReplay).toBe(true);
    });
  });
});

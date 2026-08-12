import { NAMED_NPC_PARAMS, PILLAR_URL_CODES } from "./constants";
import { Coordinates, Mob, MobSpec, ReplayData } from "./types";

export const convertMobSpecToMob = (mobSpec: MobSpec): Mob => {
  const mob: Mob = [
    mobSpec[0], // x
    mobSpec[1], // y
    mobSpec[2], // type
    mobSpec[0], // initial X
    mobSpec[1], // initial Y
    0, // attack delay
  ];
  if (mobSpec[3] !== undefined) {
    mob.push(mobSpec[3]); // assigned pillar
  }
  return mob;
};

export function getMobSpec(mob: Mob): MobSpec {
  if (mob[6] !== undefined) {
    return [mob[0], mob[1], mob[2], mob[6]];
  }
  return [mob[0], mob[1], mob[2]];
}

// https://discourse.wicg.io/t/allow-non-realtime-use-of-mediarecorder/2308/
export function record(
  canvas: HTMLCanvasElement,
  onStep: () => boolean,
  onFinish: () => void,
) {
  const captureStream = canvas.captureStream(30);
  const mediaRecorder = new MediaRecorder(captureStream, {
    mimeType: "video/webm; codecs=vp9",
    videoBitsPerSecond: 10_000_000,
  });
  const chunks: Blob[] = [];
  function step() {
    const finished = onStep();
    if (finished) {
      // give another 600ms to record the last "step" and then let the caller clean up the canvas.
      setTimeout(() => {
        mediaRecorder.stop();
        onFinish();
      }, 600);
    } else {
      setTimeout(step, 600);
    }
  }
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size === 0) {
      return;
    }
    chunks.push(e.data);
  };

  mediaRecorder.onstop = () => {
    const blob = new Blob(chunks, {
      type: "video/webm",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    document.body.appendChild(a);
    a.href = url;
    a.download = "los-replay.webm";
    a.click();
    URL.revokeObjectURL(url);
  };
  mediaRecorder.start();
  // hold the initial frame for one tick before the first step
  setTimeout(step, 600);
}

export type Bounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};
export function computeReplayBounds(
  replay: ReplayData,
  NPC_INFO: Record<number, { size: number }>,
): Bounds {
  let minPlayerX = Number.MAX_VALUE;
  let maxPlayerX = Number.MIN_VALUE;
  let minPlayerY = Number.MAX_VALUE;
  let maxPlayerY = Number.MIN_VALUE;
  // Easy to get the player's position throughout the replay.
  for (const pos of replay.playerPositions) {
    if (pos[0] < minPlayerX) {
      minPlayerX = pos[0];
    }
    if (pos[0] > maxPlayerX) {
      maxPlayerX = pos[0];
    }
    if (pos[1] < minPlayerY) {
      minPlayerY = pos[1];
    }
    if (pos[1] > maxPlayerY) {
      maxPlayerY = pos[1];
    }
  }
  // For mobs, they might move to the player's X or Y position (and we need to take their size into account)
  let minX = minPlayerX;
  let maxX = maxPlayerX;
  let minY = minPlayerY;
  let maxY = maxPlayerY;
  for (const [x, y, type] of replay.mobSpecs) {
    const size = NPC_INFO[type]?.size || 1;
    if (x < minX) {
      minX = x;
    }
    if (x + size - 1 > maxX) {
      maxX = x + size - 1;
    }
    if (maxPlayerX + size - 1 > maxX) {
      maxX = maxPlayerX + size - 1;
    }
    if (y - size + 1 < minY) {
      minY = y - size + 1;
    }
    if (minPlayerY - size + 1 < minY) {
      minY = minPlayerY - size + 1;
    }
    if (y > maxY) {
      maxY = y;
    }
  }
  return { minX, maxX, minY, maxY };
}

export function extendBounds(
  bounds: Bounds,
  extension: number,
  mapWidth: number,
  mapHeight: number,
): Bounds {
  return {
    minX: Math.max(0, bounds.minX - extension),
    maxX: Math.min(mapWidth - 1, bounds.maxX + extension),
    minY: Math.max(0, bounds.minY - extension),
    maxY: Math.min(mapHeight - 1, bounds.maxY + extension),
  };
}

export type DecodeURLResult = {
  mobs: Mob[];
  // pillar visibility, [West, North, South]
  pillars: boolean[];
  // whether the map is displayed in the default south-facing orientation
  south: boolean;
  playerCoordinates: Coordinates[] | null;
  isReplay: boolean;
};

// Decodes the legacy iFreedive URL format:
//   ?xxyyM.xxyyM. ... with optional flag tokens noWe / noN / noS / degeN
// plus the newer hash section for player position / replay / from-wave-start.
export function decodeURL(location: URL): DecodeURLResult {
  const tokens = location.search
    .replace("?", "")
    .split(".")
    .filter((s) => !!s);
  const mobs: Mob[] = [];
  const pillars = [true, true, true];
  let south = true;
  for (const token of tokens) {
    if (token === "degeN") {
      south = false;
    } else if (token === "noWe") {
      pillars[0] = false;
    } else if (token === "noN") {
      pillars[1] = false;
    } else if (token === "noS") {
      pillars[2] = false;
    } else {
      const lx = parseInt(token.slice(0, 2));
      const ly = parseInt(token.slice(2, 4));
      const rest = token.slice(4);
      const lm = parseInt(rest);
      if (isNaN(lx) || isNaN(ly) || isNaN(lm)) {
        continue;
      }
      // optional pillar-assignment suffix on nibbler tokens, e.g. 08114w.
      const suffix = rest.replace(/^[0-9]+/, "");
      const pillar = PILLAR_URL_CODES.indexOf(suffix);
      mobs.push(
        convertMobSpecToMob(pillar >= 0 ? [lx, ly, lm, pillar] : [lx, ly, lm]),
      );
    }
  }

  // Named npc parameters, as generated by the InfernoStats RuneLite plugin
  // (e.g. ?bat=[[1,5],[3,11]]&mager=[[15,28]]&copyable). Coordinates are
  // already in this tool's tile space.
  const params = new URLSearchParams(location.search);
  for (const [name, type] of Object.entries(NAMED_NPC_PARAMS)) {
    for (const value of params.getAll(name)) {
      try {
        const tiles = JSON.parse(value);
        if (!Array.isArray(tiles)) {
          continue;
        }
        for (const tile of tiles) {
          if (
            Array.isArray(tile) &&
            tile.length === 2 &&
            Number.isInteger(tile[0]) &&
            Number.isInteger(tile[1])
          ) {
            mobs.push(convertMobSpecToMob([tile[0], tile[1], type]));
          }
        }
      } catch {
        // ignore malformed parameters
      }
    }
  }

  // older URLs may carry _-separated flags after the player coordinates;
  // they are no longer used and are ignored
  const playerCoords = location.hash?.split("_")?.[0];

  let playerCoordinates: Coordinates[] | null = null;
  let isReplay = false;
  const hash = playerCoords
    ?.replace("#", "")
    .split(".")
    .filter((s) => !!s);
  if (hash?.length > 0) {
    const decodeSection = (section: string) => {
      const split = section.split("x");
      const runLength = split.length > 1 ? parseInt(split[1]) : 1;
      const coordinate = decodeCoordinates(parseInt(split[0]));
      return Array(runLength).fill(coordinate);
    };
    playerCoordinates = hash.flatMap((section) => decodeSection(section));
    // Simple spawn URL (single position) vs replay URL (multiple positions or run-length encoded)
    isReplay =
      playerCoordinates.length > 1 ||
      hash.some((section) => section.includes("x"));
  }

  return {
    mobs,
    pillars,
    south,
    playerCoordinates,
    isReplay,
  };
}

export function getBaseUrl() {
  if (window.location.protocol === "file:") {
    return `${window.location.protocol}//${window.location.pathname}?`;
  }
  return `${window.location.protocol}//${window.location.host}${window.location.pathname}?`;
}

export function getSpawnUrl(
  mobSpecs: MobSpec[],
  pillars: boolean[] = [true, true, true],
  south: boolean = true,
) {
  let url = getBaseUrl();
  mobSpecs.forEach(([locationX, locationY, mobType, pillar]) => {
    url = url
      .concat(("00" + locationX).slice(-2))
      .concat(("00" + locationY).slice(-2))
      .concat(mobType.toString());
    if (pillar !== undefined) {
      url = url.concat(PILLAR_URL_CODES[pillar]);
    }
    url = url.concat(".");
  });
  if (!pillars[0]) {
    url = url.concat("noWe.");
  }
  if (!pillars[1]) {
    url = url.concat("noN.");
  }
  if (!pillars[2]) {
    url = url.concat("noS.");
  }
  if (!south) {
    url = url.concat("degeN.");
  }
  return url;
}

export function encodeCoordinate(coords: Coordinates) {
  return (coords[0] & 0xff) | ((coords[1] & 0xff) << 8);
}

function decodeCoordinates(coords: number): Coordinates {
  return [coords & 0xff, (coords >> 8) & 0xff];
}

export function getReplayURL(
  replayData: ReplayData,
  pillars: boolean[],
  south: boolean,
) {
  const { playerPositions, mobSpecs } = replayData;
  let url = getSpawnUrl(mobSpecs, pillars, south);
  url = url.concat("#");
  const playerLocations = playerPositions.map(encodeCoordinate);
  // run-length encoding
  let last = playerLocations[0];
  let runLength = 1;
  for (let i = 1; i < playerLocations.length; i++) {
    if (playerLocations[i] !== last) {
      url = url.concat(last.toString());
      if (runLength > 1) {
        url = url.concat(`x${runLength}`);
      }
      url = url.concat(`.`);
      runLength = 1;
    } else {
      runLength++;
    }
    last = playerLocations[i];
  }
  url = url.concat(last.toString());
  if (runLength > 1) {
    url = url.concat(`x${runLength}`);
  }
  return url;
}

export function copyQ(val: string) {
  const container = document.getElementById("root")!;
  const inp = document.createElement("input");
  inp.type = "text";
  container.appendChild(inp);
  inp.value = val;
  inp.select();
  document.execCommand("Copy");
  container.removeChild(container.lastChild!);
}

import { Coordinates, Mob, MobSpec, ReplayData, TapeEntry } from "./types";
import {
  DELAY_FIRST_ATTACK_TICKS,
  FIRST_DECORATIVE_TYPE,
  MAP_HEIGHT,
  MAP_WIDTH,
  MODE_PLAYER,
  NIBBLER_GROUPS,
  NIBBLER_SPAWN,
  NPC_INFO,
  NPC_TYPES,
  NpcType,
  PILLAR_SIZE,
  PILLARS,
  SPAWNS,
  WAVES,
} from "./constants";

import {
  computeReplayBounds,
  convertMobSpecToMob,
  copyQ,
  decodeURL,
  encodeCoordinate,
  extendBounds,
  getMobSpec,
  getReplayURL,
  getSpawnUrl,
  record,
} from "./utils";

const PLAYER_ORIGIN: Coordinates = [16, 5];

const MAX_EXPORT_LENGTH = 128;
const TILE_SIZE = 20;
const TICKER_WIDTH = 9;
const TICKER_START_X = MAP_WIDTH * TILE_SIZE;
const CANVAS_WIDTH = TICKER_START_X + TICKER_WIDTH * TILE_SIZE;
const CANVAS_HEIGHT = TILE_SIZE * MAP_HEIGHT;

const CHECKER = true;

const isBlob = (t: number) => t === NPC_TYPES.BLOB_1 || t === NPC_TYPES.BLOB_2;

export class LineOfSight {
  /**
   * Current selection mode.
   */
  mode: NpcType = NPC_TYPES.PLAYER;

  /**
   * The location of the actual cursor.
   */
  cursorLocation: Coordinates | null = null;
  /**
   * The location of the player.
   */
  selected: Coordinates = [...PLAYER_ORIGIN];
  stepStartPosition: Coordinates | null = null;
  mousedOverNpc: number | null = null;

  mobs: Mob[] = [];
  // tape for mobs
  tape: TapeEntry[] = [];
  playerTape: Coordinates[] = [];
  tapeSelectionRange: number[] | null = null; // tape selection, [start, end]

  tickCount = 0;

  // Visualisation settings
  showSpawns = true;
  showPlayerLoS = true;
  showNibblerSpawn = true;
  fromWaveStart: boolean = false;

  // Map orientation. The canvas is rotated 180 degrees via CSS when true
  // (the default), showing the arena as seen from the south.
  south = true;

  // Pillar visibility, [West, North, South]
  pillarsEnabled = [true, true, true];

  replay: Coordinates[] | null = null;
  replayTick: number | null = null;
  replayAuto: ReturnType<typeof setTimeout> | null = null;

  draggingNpcIndex: number | null = null;
  draggingNpcOffset: Coordinates | null = null;

  mapElement: HTMLCanvasElement | null = null;
  ctx: CanvasRenderingContext2D | null = null;
  subscribers: VoidFunction[] = [];

  imagesSouth: (HTMLImageElement | null)[] = [];
  imagesNorth: (HTMLImageElement | null)[] = [];

  hasLoadedSpawns = false;

  public initDOM(mapElement: HTMLCanvasElement) {
    this.mapElement = mapElement;
    this.ctx = mapElement.getContext("2d")!;
    this.mapElement.width = CANVAS_WIDTH;
    this.mapElement.height = CANVAS_HEIGHT;
    this.loadSpawns();
    this.drawWave();

    // Preload images for both orientations
    Object.entries(NPC_INFO).forEach(([type, { imgSouth, imgNorth }]) => {
      const t = Number(type);
      [
        [imgSouth, this.imagesSouth],
        [imgNorth, this.imagesNorth],
      ].forEach(([src, target]) => {
        if (!src) {
          return;
        }
        const image = new Image();
        image.src = src as string;
        image.onload = () => {
          (target as (HTMLImageElement | null)[])[t] = image;
          this.drawWave();
        };
      });
    });
  }

  private images() {
    return this.south ? this.imagesSouth : this.imagesNorth;
  }

  private doAutoTick() {
    if (!this.replayAuto) {
      return;
    }
    this.step();
    this.drawWave();
  }

  public toggleAutoReplay() {
    if (this.replayAuto) {
      clearTimeout(this.replayAuto);
      this.replayAuto = null;
    } else {
      this.replayAuto = setTimeout(() => this.doAutoTick(), 600);
    }
    this.updateUi();
  }

  public exportReplay() {
    if (!this.mapElement) {
      return;
    }
    const { playerPositions, mobSpecs } = this.getReplayData();
    const rawBounds = computeReplayBounds({ playerPositions, mobSpecs }, NPC_INFO);
    const bounds = extendBounds(rawBounds, 4, MAP_WIDTH, MAP_HEIGHT); // extend visible area by 4 tiles
    const playAreaWidth = (bounds.maxX - bounds.minX + 1) * TILE_SIZE;
    const playAreaHeight = (bounds.maxY - bounds.minY + 1) * TILE_SIZE;

    const sourceCanvas = this.mapElement;
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = playAreaWidth + TICKER_WIDTH * TILE_SIZE;
    exportCanvas.height = playAreaHeight;

    this.reset();
    this.mobs = mobSpecs.map(convertMobSpecToMob);
    this.replay = playerPositions;
    this.replayTick = 0;
    this.selected = this.replay[0];

    record(
      exportCanvas,
      () => {
        if (this.replayTick === null || !this.replay) {
          return true;
        }
        if (this.replayTick >= this.replay.length) {
          // need to draw the wave one more time to be included in the video
          this.drawWave();
          return true;
        }
        this.step(true);
        const exportCtx = exportCanvas.getContext("2d")!;
        // The canvas content already matches the on-screen orientation, so
        // plain copies suffice. In the south view the map is drawn rotated,
        // so the content bounds map to a mirrored source rect.
        const srcX = this.south
          ? TICKER_START_X - (bounds.maxX + 1) * TILE_SIZE
          : bounds.minX * TILE_SIZE;
        const srcY = this.south
          ? CANVAS_HEIGHT - (bounds.maxY + 1) * TILE_SIZE
          : bounds.minY * TILE_SIZE;
        exportCtx.drawImage(
          sourceCanvas,
          srcX,
          srcY,
          playAreaWidth,
          playAreaHeight,
          0,
          0,
          playAreaWidth,
          playAreaHeight,
        );
        exportCtx.drawImage(
          sourceCanvas,
          TICKER_START_X,
          0,
          TICKER_WIDTH * TILE_SIZE,
          CANVAS_HEIGHT,
          playAreaWidth,
          0,
          TICKER_WIDTH * TILE_SIZE,
          CANVAS_HEIGHT,
        );
        return false;
      },
      () => {
        this.replay = null;
        this.replayTick = null;
        this.reset();
      },
    );
  }

  /**
   * Subscribe to changes in the state exposed by this LOS instance.
   */
  public subscribe(callback: VoidFunction) {
    this.subscribers.push(callback);
  }

  /**
   * Subscribe to changes in the state exposed by this LOS instance.
   */
  public unsubscribe(callback: VoidFunction) {
    this.subscribers = this.subscribers.filter((c) => c !== callback);
  }

  private onUpdateSubscribers() {
    this.subscribers.forEach((callback) => callback());
  }

  public setFromWaveStart = (val: boolean) => {
    this.fromWaveStart = val;
    this.onUpdateSubscribers();
  };

  private updateUi() {
    // currently, we always fire subscriber events
    this.onUpdateSubscribers();
  }

  private _lastUiState: ReturnType<LineOfSight["computeUiState"]> | null = null;
  private computeUiState() {
    return {
      fromWaveStart: this.fromWaveStart,
      south: this.south,
      pillarWest: this.pillarsEnabled[0],
      pillarNorth: this.pillarsEnabled[1],
      pillarSouth: this.pillarsEnabled[2],
      showSpawns: this.showSpawns,
      showPlayerLoS: this.showPlayerLoS,
      showNibblerSpawn: this.showNibblerSpawn,
      isReplaying: !!this.replayAuto,
      hasReplay: !!this.replay && this.replayTick !== null && !!this.replay[this.replayTick],
      replayLength: this.replay?.length ?? null,
      canSaveReplay: !this.replayAuto && this.tape.length > 0 && this.tape.length <= 32,
      replayTick: this.replayTick ?? 0,
    };
  }
  public getUiState() {
    const uiState = this.computeUiState();
    // check if any UI state has changed
    if (
      !this._lastUiState ||
      Object.entries(uiState).some(
        ([k, v]) => this._lastUiState![k as keyof typeof uiState] !== v,
      )
    ) {
      this._lastUiState = uiState;
      return uiState;
    }
    return this._lastUiState;
  }

  public handleKeyDown(e: KeyboardEvent) {
    switch (e.keyCode) {
      case 38: // up
        this.step(true);
        break;
      case 40: // down
        this.reset();
        break;
      case 81: // q
        this.placeByKey(NPC_TYPES.BAT);
        break;
      case 87: // w
        this.placeByKey(NPC_TYPES.BLOB_1);
        break;
      case 69: // e
        this.placeByKey(NPC_TYPES.MELEE);
        break;
      case 82: // r
        this.placeByKey(NPC_TYPES.RANGER);
        break;
      case 84: // t
        this.placeByKey(NPC_TYPES.MAGER);
        break;
      case 85: // u
        this.placeByKey(NPC_TYPES.NIBBLER);
        break;
    }
  }

  private placeByKey(type: NpcType) {
    this.setMode(type, true);
    this.place();
    this.drawWave();
  }

  /**
   * Maps canvas-local pixel coordinates to map tile coordinates, accounting
   * for the map region being drawn rotated in the south view.
   */
  private eventToTile(offsetX: number, offsetY: number): Coordinates {
    if (this.south) {
      return [
        Math.floor((TICKER_START_X - 1 - offsetX) / TILE_SIZE),
        Math.floor((CANVAS_HEIGHT - 1 - offsetY) / TILE_SIZE),
      ];
    }
    return [Math.floor(offsetX / TILE_SIZE), Math.floor(offsetY / TILE_SIZE)];
  }

  public onCanvasMouseDown(e: React.MouseEvent) {
    const offsetX = e.nativeEvent.offsetX;
    const offsetY = e.nativeEvent.offsetY;
    let selectedNpcIndex = null;
    if (offsetX < TICKER_START_X) {
      const [x, y] = this.eventToTile(offsetX, offsetY);
      if (this.replay) {
        this.stopReplay();
      }
      for (let i = 0; i < this.mobs.length; i++) {
        if (this.doesCollide(x, y, 1, this.mobs[i][0], this.mobs[i][1], NPC_INFO[this.mobs[i][2]].size)) {
          selectedNpcIndex = i;
          break;
        }
      }
      if (selectedNpcIndex === null) {
        if (this.mode === MODE_PLAYER) {
          // move player
          this.selected = [x, y];
        }
        this.cursorLocation = [x, y];
      } else {
        // start drag
        this.draggingNpcIndex = selectedNpcIndex;
        this.draggingNpcOffset = [
          x - this.mobs[selectedNpcIndex][0],
          y - this.mobs[selectedNpcIndex][1],
        ];
        this.cursorLocation = null;
      }
    } else {
      const tapeIndex = Math.floor(offsetY / TILE_SIZE);
      if (tapeIndex >= 0 && tapeIndex <= this.tape.length + 1) {
        this.tapeSelectionRange = [tapeIndex];
      }
    }
    this.drawWave();
  }

  public onCanvasMouseUp(e: React.MouseEvent) {
    if (this.tapeSelectionRange?.length === 1) {
      const tapeIndex = Math.floor(e.nativeEvent.offsetY / TILE_SIZE);
      if (e.nativeEvent.offsetX >= TICKER_START_X && tapeIndex >= 0) {
        const endY = Math.min(tapeIndex + 1, this.tape.length);
        this.tapeSelectionRange = [this.tapeSelectionRange[0], endY];
      }
    }
    this.draggingNpcIndex = null;
    this.draggingNpcOffset = null;
    this.drawWave();
  }

  public onCanvasDblClick(e: React.MouseEvent) {
    if (e.nativeEvent.offsetX < TICKER_START_X) {
      const [x, y] = this.eventToTile(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
      for (let i = 0; i < this.mobs.length; i++) {
        if (this.doesCollide(x, y, 1, this.mobs[i][0], this.mobs[i][1], NPC_INFO[this.mobs[i][2]].size)) {
          this.removeMob(i);
          break;
        }
      }
      this.drawWave();
    }
  }

  public onCanvasMouseWheel(e: React.WheelEvent) {
    if (e.deltaY > 0) {
      this.step();
      this.drawWave();
    } else {
      this.reset();
      this.drawWave();
    }
  }

  public onCanvasMouseOut() {
    // delete dragged npc if out of map
    if (this.draggingNpcIndex !== null) {
      this.removeMob(this.draggingNpcIndex);
      this.draggingNpcIndex = null;
      this.drawWave();
    }
  }

  public onCanvasMouseMove(e: React.MouseEvent) {
    // dragging
    const offsetX = e.nativeEvent.offsetX;
    const offsetY = e.nativeEvent.offsetY;
    if (offsetX < 0 || offsetX >= TICKER_START_X || offsetY < 0 || offsetY > CANVAS_HEIGHT) {
      return;
    }
    const [x, y] = this.eventToTile(offsetX, offsetY);
    let mouseIcon = "auto";
    let dirty = false;
    const wasMousedOverNpc = this.mousedOverNpc;
    this.mousedOverNpc = null;
    for (let i = 0; i < this.mobs.length; i++) {
      if (this.doesCollide(x, y, 1, this.mobs[i][0], this.mobs[i][1], NPC_INFO[this.mobs[i][2]].size)) {
        mouseIcon = "move";
        this.mousedOverNpc = i;
        break;
      }
    }
    dirty ||= this.mousedOverNpc !== wasMousedOverNpc;

    this.mapElement!.style.cursor = mouseIcon;
    if (e.buttons & 0x1) {
      // holding left button
      if (this.draggingNpcIndex !== null && this.draggingNpcOffset !== null) {
        this.mobs[this.draggingNpcIndex][0] = x - this.draggingNpcOffset[0];
        this.mobs[this.draggingNpcIndex][1] = y - this.draggingNpcOffset[1];
        this.mobs[this.draggingNpcIndex][3] = x - this.draggingNpcOffset[0];
        this.mobs[this.draggingNpcIndex][4] = y - this.draggingNpcOffset[1];
        this.cursorLocation = null;
      } else if (this.mode > MODE_PLAYER) {
        this.cursorLocation = [x, y];
      } else {
        this.cursorLocation = [x, y];
        this.selected = [x, y];
      }
      dirty = true;
    }
    if (dirty) {
      this.drawWave();
    }
  }

  private loadSpawns() {
    if (this.hasLoadedSpawns) {
      return;
    }
    this.hasLoadedSpawns = true;
    const { mobs: decodedMobs, pillars, south, isFromWaveStart, playerCoordinates, isReplay } =
      decodeURL(new URL(window.location.toString()));
    this.mobs = decodedMobs;
    this.sortMobs();
    this.pillarsEnabled = pillars;
    this.south = south;
    this.setFromWaveStart(isFromWaveStart);
    if (!playerCoordinates) {
      return;
    }

    if (isReplay) {
      // This is a replay URL - start the replay
      this.replay = playerCoordinates;
      this.replayTick = 0;
      this.selected = this.replay[0];
      this.step();
      this.replayAuto = setTimeout(() => this.doAutoTick(), 600);
    } else {
      // This is a spawn URL with just a player position - set position without starting replay
      this.selected = playerCoordinates[0];
    }
  }

  public copySpawnURL() {
    const mobSpecs = this.mobs.filter((mob) => mob[2] > MODE_PLAYER).map(getMobSpec);
    let url = getSpawnUrl(mobSpecs, this.pillarsEnabled, this.south);

    // Check if player has been moved from starting position
    const playerMoved =
      this.selected[0] !== PLAYER_ORIGIN[0] || this.selected[1] !== PLAYER_ORIGIN[1];

    // Build hash fragments
    const hashParts = [];

    // Add player position if moved
    if (playerMoved) {
      hashParts.push(encodeCoordinate(this.selected));
    }

    // Add flags if enabled
    if (this.fromWaveStart) {
      hashParts.push("_ws");
    }

    // Add hash if there are any parts
    if (hashParts.length > 0) {
      url = url.concat("#" + hashParts.join(""));
    }

    copyQ(url);
    alert("Spawn URL Copied!");
  }

  private getReplayData(): ReplayData {
    let lowerBound, upperBoundInclusive;
    if (this.tapeSelectionRange?.length === 2) {
      lowerBound = this.tapeSelectionRange[0];
      upperBoundInclusive = Math.min(
        this.tapeSelectionRange[1] + 1,
        this.tapeSelectionRange[0] + MAX_EXPORT_LENGTH,
      );
    } else {
      lowerBound = 0;
      upperBoundInclusive = Math.min(this.tape.length, MAX_EXPORT_LENGTH);
    }
    const mobTicks = this.tape.slice(lowerBound, upperBoundInclusive);
    const playerPositions = this.playerTape.slice(lowerBound, upperBoundInclusive);

    // get the mob positions/specs at the start of the selection
    const mobSpecs = mobTicks[0].map(
      (value, mobIdx) =>
        [
          (value >> 16) & 0xff,
          (value >> 24) & 0xff,
          this.mobs[mobIdx][2],
        ] as MobSpec,
    );
    return { playerPositions, mobSpecs };
  }

  public copyReplayURL() {
    const url = getReplayURL(
      this.getReplayData(),
      this.pillarsEnabled,
      this.south,
      this.fromWaveStart,
    );
    copyQ(url);
    alert("Replay URL Copied!");
  }

  public togglePlayerLoS() {
    this.showPlayerLoS = !this.showPlayerLoS;
    this.drawWave();
  }

  public toggleSpawns() {
    this.showSpawns = !this.showSpawns;
    this.drawWave();
  }

  public toggleNibblerSpawn() {
    this.showNibblerSpawn = !this.showNibblerSpawn;
    this.drawWave();
  }

  public togglePillar(index: number) {
    this.pillarsEnabled[index] = !this.pillarsEnabled[index];
    this.drawWave();
  }

  public toggleNS() {
    this.south = !this.south;
    this.drawWave();
  }

  /**
   * Moves all melee mobs to their "dig" position relative to the player,
   * mimicking Jal-ImKot's dig special.
   */
  public meleeDig() {
    for (let i = 0; i < this.mobs.length; i++) {
      if (this.mobs[i][2] === NPC_TYPES.MELEE) {
        if (this.digPosition(this.selected[0] - 3, this.selected[1] + 3)) {
          this.mobs[i][0] = this.selected[0] - 3;
          this.mobs[i][1] = this.selected[1] + 3;
        } else if (this.digPosition(this.selected[0], this.selected[1])) {
          this.mobs[i][0] = this.selected[0];
          this.mobs[i][1] = this.selected[1];
        } else if (this.digPosition(this.selected[0] - 3, this.selected[1])) {
          this.mobs[i][0] = this.selected[0] - 3;
          this.mobs[i][1] = this.selected[1];
        } else if (this.digPosition(this.selected[0], this.selected[1] + 3)) {
          this.mobs[i][0] = this.selected[0];
          this.mobs[i][1] = this.selected[1] + 3;
        } else {
          this.mobs[i][0] = this.selected[0] - 1;
          this.mobs[i][1] = this.selected[1] + 1;
        }
      }
    }
    this.drawWave();
  }

  private digPosition(x: number, y: number) {
    if (y - 3 < 0 || x + 3 > MAP_WIDTH - 1 || x < 0 || y > MAP_HEIGHT - 1) {
      return false;
    }
    for (let i = 0; i < PILLARS.length; i++) {
      if (
        this.pillarsEnabled[i] &&
        this.doesCollide(x, y, 4, PILLARS[i][0], PILLARS[i][1], PILLAR_SIZE)
      ) {
        return false;
      }
    }
    return true;
  }

  /**
   * Clears all mobs and loads the given wave (1-66) with random spawn
   * positions, plus a random decorative nibbler group.
   */
  public loadWave(wave: number) {
    if (isNaN(wave) || wave < 1 || wave > WAVES.length) {
      return;
    }
    this.mode = MODE_PLAYER;
    this.mobs = [];
    this.reset();
    const loaded = WAVES[wave - 1];
    // nibblers spawn at the base of a pillar, so only standing pillars
    // are candidates
    const availableGroups = NIBBLER_GROUPS.filter(
      (_, i) => this.pillarsEnabled[i],
    );
    if (availableGroups.length > 0) {
      const nibblers =
        availableGroups[Math.floor(Math.random() * availableGroups.length)];
      this.mobs.push(convertMobSpecToMob([nibblers[0], nibblers[1], nibblers[2]]));
    }
    const availSpawns = [...SPAWNS];
    for (let i = 0; i < loaded.length; i++) {
      const [spawn] = availSpawns.splice(Math.floor(Math.random() * availSpawns.length), 1);
      this.mobs.push(convertMobSpecToMob([spawn[0], spawn[1], loaded[i]]));
    }
    this.sortMobs();
    this.drawWave();
  }

  private isPillar(x: number, y: number) {
    for (let j = 0; j < PILLARS.length; j++) {
      if (
        this.pillarsEnabled[j] &&
        this.doesCollide(x, y, 1, PILLARS[j][0], PILLARS[j][1], PILLAR_SIZE)
      ) {
        return true;
      }
    }
    return false;
  }

  private removeMob(index: number) {
    this.mobs.splice(index, 1);
    this.tape = this.tape.map((entries) => {
      return entries.filter((_mobData, i) => i !== index);
    });
  }

  private hasLOS(
    x1: number,
    y1: number,
    // target x, y
    x2: number,
    y2: number,
    s = 1,
    r = 1,
    isNPC = false,
  ): boolean {
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (
      this.isPillar(x1, y1) ||
      this.isPillar(x2, y2) ||
      this.doesCollide(x1, y1, s, x2, y2, 1)
    ) {
      return false;
    }
    //assume range 1 is melee
    if (r == 1) {
      return (
        (dx < s && dx >= 0 && (dy == 1 || dy == -s)) ||
        (dy > -s && dy <= 0 && (dx == -1 || dx == s))
      );
    }
    if (isNPC) {
      const tx = Math.max(x1, Math.min(x1 + s - 1, x2));
      const ty = Math.max(y1 - s + 1, Math.min(y1, y2));
      return this.hasLOS(x2, y2, tx, ty, 1, r, false);
    }
    const dxAbs = Math.abs(dx);
    const dyAbs = Math.abs(dy);
    if (dxAbs > r || dyAbs > r) {
      return false;
    } //iFreedive
    if (dxAbs > dyAbs) {
      let xTile = x1;
      let y = (y1 << 16) + 0x8000;
      const slope = Math.trunc((dy << 16) / dxAbs); // Integer division
      const xInc = dx > 0 ? 1 : -1;
      if (dy < 0) {
        y -= 1; // For correct rounding
      }
      while (xTile !== x2) {
        xTile += xInc;
        const yTile = y >>> 16;
        if (this.isPillar(xTile, yTile)) {
          return false;
        }
        y += slope;
        const newYTile = y >>> 16;
        if (newYTile !== yTile && this.isPillar(xTile, newYTile)) {
          return false;
        }
      }
    } else {
      let yTile = y1;
      let x = (x1 << 16) + 0x8000;
      const slope = Math.trunc((dx << 16) / dyAbs); // Integer division
      const yInc = dy > 0 ? 1 : -1;
      if (dx < 0) {
        x -= 1; // For correct rounding
      }
      while (yTile !== y2) {
        yTile += yInc;
        const xTile = x >>> 16;
        if (this.isPillar(xTile, yTile)) {
          return false;
        }
        x += slope;
        const newXTile = x >>> 16;
        if (newXTile !== xTile && this.isPillar(newXTile, yTile)) {
          return false;
        }
      }
    }
    return true;
  }

  private doesCollide(x: number, y: number, s: number, x2: number, y2: number, s2: number) {
    if (x > x2 + s2 - 1 || x + s - 1 < x2 || y - s + 1 > y2 || y < y2 - s2 + 1) {
      return false;
    }
    return true;
  }

  private legalPosition(x: number, y: number, size: number, index: number) {
    if (y - (size - 1) < 0 || x + (size - 1) > MAP_WIDTH - 1 || x < 0 || y > MAP_HEIGHT - 1) {
      return false;
    }
    for (let i = 0; i < PILLARS.length; i++) {
      if (
        this.pillarsEnabled[i] &&
        this.doesCollide(x, y, size, PILLARS[i][0], PILLARS[i][1], PILLAR_SIZE)
      ) {
        return false;
      }
    }
    const type = this.mobs[index][2];
    // nibblers ignore collision with other mobs entirely
    if (type !== NPC_TYPES.NIBBLER) {
      for (let i = 0; i < this.mobs.length; i++) {
        if (
          i != index &&
          this.mobs[i][2] < FIRST_DECORATIVE_TYPE &&
          this.mobs[i][2] !== NPC_TYPES.NIBBLER &&
          this.doesCollide(x, y, size, this.mobs[i][0], this.mobs[i][1], NPC_INFO[this.mobs[i][2]].size)
        ) {
          return false;
        }
      }
    }
    return true;
  }

  private sortMobs() {
    // descending by type, matching the original tool (tape column order)
    this.mobs = this.mobs.sort(function (a, b) {
      return b[2] - a[2];
    });
  }

  public place() {
    if (this.cursorLocation) {
      if (this.mode > MODE_PLAYER) {
        //prevent 2 mobs on same tile
        for (let i = 0; i < this.mobs.length; i++) {
          if (
            this.mobs[i][3] == this.cursorLocation[0] &&
            this.mobs[i][4] == this.cursorLocation[1]
          ) {
            return;
          }
        }
        const newMob: Mob = [
          this.cursorLocation[0],
          this.cursorLocation[1],
          this.mode,
          this.cursorLocation[0],
          this.cursorLocation[1],
          0,
        ];

        this.mobs.push(newMob);
        this.sortMobs();
        // the sort reorders the tape columns; clear any recorded ticks
        this.tape = [];
        this.playerTape = [];
        // Only reset mode after successfully placing an NPC
        this.mode = MODE_PLAYER;
      } else {
        this.selected = [...this.cursorLocation];
      }
      this.cursorLocation = null;
      this.drawWave();
    }
  }

  private advanceReplay() {
    if (this.replay && this.replayTick !== null) {
      if (this.replay[this.replayTick]) {
        this.selected = this.replay[this.replayTick];
      } else {
        this.reset();
      }
      this.replayTick++;
      if (this.replayAuto) {
        clearTimeout(this.replayAuto);
        this.replayAuto = setTimeout(() => this.doAutoTick(), 600);
      }
    }
  }

  private moveMobs(canMove: boolean, canGainLos: boolean) {
    for (let i = 0; i < this.mobs.length; i++) {
      if (this.mobs[i][2] < FIRST_DECORATIVE_TYPE) {
        const mob = this.mobs[i];
        mob[5]--; // Decrement cooldown
        const x = mob[0];
        const y = mob[1];
        const t = mob[2];
        const { size: s, range: r } = NPC_INFO[t];

        if (
          canMove &&
          !(canGainLos && this.hasLOS(x, y, this.selected[0], this.selected[1], s, r, true))
        ) {
          const dx = x + Math.sign(this.selected[0] - x);
          let dy = y + Math.sign(this.selected[1] - y);
          //allows corner safespotting
          if (this.doesCollide(dx, dy, s, this.selected[0], this.selected[1], 1)) {
            dy = mob[1];
          }
          if (this.legalPosition(dx, dy, s, i)) {
            // move diagonally
            mob[0] = dx;
            mob[1] = dy;
          } else if (this.legalPosition(dx, y, s, i)) {
            mob[0] = dx;
          } else if (this.legalPosition(x, dy, s, i)) {
            mob[1] = dy;
          }
        }
      }
    }
  }

  private processAttacks(
    canAttack: boolean,
    preMovePositions: Coordinates[],
  ): TapeEntry {
    const line: TapeEntry = [];

    for (let i = 0; i < this.mobs.length; i++) {
      const mob = this.mobs[i];
      const x = mob[0];
      const y = mob[1];
      const t = mob[2];
      let attacked = 0;
      if (t < FIRST_DECORATIVE_TYPE) {
        const { size: s, range: r } = NPC_INFO[t];
        if (canAttack && this.hasLOS(x, y, this.selected[0], this.selected[1], s, r, true)) {
          if (mob[5] <= 0) {
            attacked = 1;
            mob[5] = NPC_INFO[t].cd;
          }
        }
      }
      // the tape records the position from BEFORE this tick's movement, so
      // that a replay seeded from tape[n] reproduces tick n exactly
      const [px, py] = preMovePositions[i];
      const value = attacked | ((px & 0xff) << 16) | ((py & 0xff) << 24);
      line.push(value);
    }

    return line;
  }

  public step(draw: boolean = false) {
    // Capture the player's position when stepping begins
    if (this.tickCount === 0 && !this.replay) {
      this.stepStartPosition = [...this.selected];
    }

    this.advanceReplay();

    if (this.mode == MODE_PLAYER && this.mobs.length > 0) {
      const canAttack = this.fromWaveStart ? this.tickCount >= DELAY_FIRST_ATTACK_TICKS : true;
      const canMove = this.fromWaveStart ? this.tickCount > 0 : true;
      const canGainLos = this.fromWaveStart ? this.tickCount > 1 : true;

      const preMovePositions: Coordinates[] = this.mobs.map((m) => [m[0], m[1]]);

      // Move all mobs
      this.moveMobs(canMove, canGainLos);

      // Process attacks
      const line = this.processAttacks(canAttack, preMovePositions);

      // Record this tick's player position and mob actions to history
      this.playerTape.push([this.selected[0], this.selected[1]]);
      this.tape.push(line);
    }
    this.tickCount++;
    if (draw) {
      this.drawWave();
    }
  }

  private stopReplay() {
    this.replay = null;
    this.replayTick = null;
    if (this.replayAuto) {
      clearTimeout(this.replayAuto);
    }
    this.replayAuto = null;
    this.updateUi();
  }

  public remove() {
    this.mobs = [];
    this.stopReplay();
    this.stepStartPosition = null;
    this.reset();
    this.drawWave();
  }

  public reset() {
    for (let i = 0; i < this.mobs.length; i++) {
      this.mobs[i][0] = this.mobs[i][3];
      this.mobs[i][1] = this.mobs[i][4];
      this.mobs[i][5] = 0;
    }
    this.tape = [];
    this.playerTape = [];
    this.tapeSelectionRange = null;
    this.tickCount = 0;
    if (this.replay) {
      this.replayTick = 0;
      this.selected = this.replay[0];
    } else if (this.stepStartPosition) {
      // Reset player to position at start of stepping (like replay mode does)
      this.selected = [...this.stepStartPosition];
    }
    this.draggingNpcIndex = null;
    this.draggingNpcOffset = null;
    this.cursorLocation = null;
    this.drawWave();
  }

  public setMode(m: NpcType, initPosition: boolean = false) {
    if (initPosition && this.cursorLocation === null) {
      this.cursorLocation = [...this.selected];
    }
    this.mode = m;
    this.drawWave();
  }

  private drawLOS(x: number, y: number, s: number, r: number, isNPC: boolean, color = "red") {
    if (!this.ctx) {
      return;
    }
    if (this.showPlayerLoS) {
      this.ctx.globalAlpha = 0.35;
    } else {
      this.ctx.globalAlpha = 0;
    }

    for (let i = 0; i < MAP_WIDTH * MAP_HEIGHT; i++) {
      this.ctx.fillStyle = color;

      const x2 = i % MAP_WIDTH;
      const y2 = Math.floor(i / MAP_WIDTH);

      if (this.hasLOS(x, y, x2, y2, s, r, isNPC)) {
        this.ctx.fillRect(x2 * TILE_SIZE, y2 * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }
    this.ctx.globalAlpha = 1;
  }

  public drawWave() {
    this.updateUi();
    if (!this.ctx || !this.mapElement) {
      return;
    }
    const ctx = this.ctx;
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, this.mapElement.width, this.mapElement.height);

    // The map region is drawn rotated 180 degrees in the south view (the
    // default), showing the arena as seen from the south. The ticker is
    // drawn outside this transform so it always sits on the right and
    // reads top-to-bottom.
    ctx.save();
    if (this.south) {
      ctx.translate(TICKER_START_X, CANVAS_HEIGHT);
      ctx.rotate(Math.PI);
    }

    const checkerColor = CHECKER ? "#eee" : "#fff";
    for (let i = 0; i < MAP_WIDTH * MAP_HEIGHT; i++) {
      ctx.fillStyle = i % 2 ? "#fff" : checkerColor;
      ctx.fillRect((i % MAP_WIDTH) * TILE_SIZE, Math.floor(i / MAP_WIDTH) * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }
    //pillars
    ctx.fillStyle = "#222";
    for (let i = 0; i < PILLARS.length; i++) {
      if (this.pillarsEnabled[i]) {
        ctx.fillRect(
          PILLARS[i][0] * TILE_SIZE,
          (PILLARS[i][1] + 1) * TILE_SIZE,
          PILLAR_SIZE * TILE_SIZE,
          -PILLAR_SIZE * TILE_SIZE,
        );
      }
    }
    // spawn zones
    ctx.globalAlpha = this.showSpawns ? 0.35 : 0;
    ctx.fillStyle = "#999";
    for (let i = 0; i < SPAWNS.length; i++) {
      ctx.fillRect(
        SPAWNS[i][0] * TILE_SIZE,
        (SPAWNS[i][1] + 1) * TILE_SIZE,
        4 * TILE_SIZE,
        -4 * TILE_SIZE,
      );
    }
    // nibbler spawn zone
    ctx.globalAlpha = this.showNibblerSpawn ? 0.35 : 0;
    ctx.fillStyle = "blue";
    ctx.fillRect(
      NIBBLER_SPAWN[0] * TILE_SIZE,
      (NIBBLER_SPAWN[1] + 1) * TILE_SIZE,
      3 * TILE_SIZE,
      -3 * TILE_SIZE,
    );
    ctx.globalAlpha = 1;
    //mobs
    for (let i = 0; i < this.mobs.length; i++) {
      const x = this.mobs[i][0];
      const y = this.mobs[i][1];
      const t = this.mobs[i][2];
      const { size: s, range: r, color: c } = NPC_INFO[t];
      ctx.fillStyle = ctx.strokeStyle = c;
      if (t < FIRST_DECORATIVE_TYPE && t !== NPC_TYPES.NIBBLER) {
        ctx.fillRect(x * TILE_SIZE, (y + 1) * TILE_SIZE, TILE_SIZE, -TILE_SIZE);
        ctx.strokeRect(x * TILE_SIZE + 1, (y + 1) * TILE_SIZE - 1, s * TILE_SIZE, -s * TILE_SIZE);
      }
      if (
        t < FIRST_DECORATIVE_TYPE &&
        this.mode == MODE_PLAYER &&
        this.hasLOS(x, y, this.selected[0], this.selected[1], s, r, true)
      ) {
        ctx.fillStyle = "black";
        ctx.fillRect(x * TILE_SIZE, (y + 1) * TILE_SIZE, TILE_SIZE / 4, -TILE_SIZE / 4);
      }
    }
    if (this.draggingNpcIndex !== null) {
      // currently dragging an NPC, draw its LOS
      const t = this.mobs[this.draggingNpcIndex][2];
      this.drawLOS(
        this.mobs[this.draggingNpcIndex][0],
        this.mobs[this.draggingNpcIndex][1],
        NPC_INFO[t].size,
        NPC_INFO[t].range,
        t > 0,
        NPC_INFO[t].color,
      );
    } else if (this.cursorLocation) {
      // currently placing an NPC, draw its LOS
      const { size: s, range: r, color: c } = NPC_INFO[this.mode];
      this.drawLOS(this.cursorLocation[0], this.cursorLocation[1], s, r, this.mode > 0, c);
    } else {
      // draw the player's LOS
      const { size: s, range: r, color: c } = NPC_INFO[MODE_PLAYER];
      this.drawLOS(this.selected[0], this.selected[1], s, r, false, c);
    }

    // draw player: magenta tile (contrasts with the cyan LoS overlay) with
    // the sprite squashed into it, as in Supalosa's tool. The draw rect is
    // exactly the tile square, so the same code works in both orientations
    // (with the flipped south sprite)
    {
      const { size: s } = NPC_INFO[MODE_PLAYER];
      ctx.fillStyle = "magenta";
      ctx.fillRect(
        this.selected[0] * TILE_SIZE,
        (this.selected[1] + 1) * TILE_SIZE,
        TILE_SIZE,
        -TILE_SIZE,
      );
      const image = this.images()[MODE_PLAYER];
      if (image) {
        ctx.drawImage(
          image,
          this.selected[0] * TILE_SIZE,
          (this.selected[1] - s + 1) * TILE_SIZE,
          s * TILE_SIZE,
          s * TILE_SIZE,
        );
      }
    }

    if (this.cursorLocation) {
      const { size: s, color: c } = NPC_INFO[this.mode];
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = ctx.strokeStyle = c;
      ctx.fillRect(
        this.cursorLocation[0] * TILE_SIZE,
        (this.cursorLocation[1] + 1) * TILE_SIZE,
        TILE_SIZE,
        -TILE_SIZE,
      );
      ctx.strokeRect(
        this.cursorLocation[0] * TILE_SIZE,
        (this.cursorLocation[1] + 1) * TILE_SIZE,
        s * TILE_SIZE,
        -s * TILE_SIZE,
      );
      const image = this.images()[this.mode];
      if (image && this.mode !== MODE_PLAYER) {
        ctx.drawImage(image, this.cursorLocation[0] * TILE_SIZE, (this.cursorLocation[1] - s + 1) * TILE_SIZE);
      }
      ctx.globalAlpha = 1;
    }
    // mob images
    for (let i = 0; i < this.mobs.length; i++) {
      const [x, y, t] = this.mobs[i];
      const s = NPC_INFO[t].size;
      if (!t || t === MODE_PLAYER) {
        continue;
      }
      const image = this.images()[t];
      if (image) {
        ctx.drawImage(image, x * TILE_SIZE, (y - s + 1) * TILE_SIZE);
      }
    }

    // orientation labels; drawn flipped when the map is rotated so they
    // read correctly on screen
    const drawLabel = (text: string, cx: number, cy: number, color: string) => {
      ctx.save();
      ctx.font = "16px sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = color;
      ctx.translate(cx, cy);
      if (this.south) {
        ctx.rotate(Math.PI);
        ctx.textBaseline = "bottom";
      } else {
        ctx.textBaseline = "top";
      }
      ctx.fillText(text, 0, 0);
      ctx.restore();
    };
    drawLabel("North", (MAP_WIDTH / 2) * TILE_SIZE, 4, "red");
    drawLabel("South", (MAP_WIDTH / 2) * TILE_SIZE, (MAP_HEIGHT - 1) * TILE_SIZE + 4, "#666");

    // end of the (possibly rotated) map region
    ctx.restore();

    // ticker tape, always on the right reading top-to-bottom
    const offset = TICKER_START_X;
    const tickerStartY = (idx: number) => TILE_SIZE * idx;
    for (let i = 0; i < this.tape.length; i++) {
      if (this.fromWaveStart && i < DELAY_FIRST_ATTACK_TICKS) {
        ctx.fillStyle = i % 2 == 0 ? "#666" : "#777";
      } else {
        ctx.fillStyle = i % 2 == 0 ? "#ddd" : "#eee";
      }
      ctx.fillRect(offset, TILE_SIZE * i, TILE_SIZE * TICKER_WIDTH, TILE_SIZE);
      for (let j = 0; j < this.tape[i].length; j++) {
        const value = this.tape[i][j];
        const attacked = value & 0xff;
        const t = this.mobs[j]?.[2];
        if (t === undefined || t >= FIRST_DECORATIVE_TYPE) {
          continue;
        }
        if (t > 0 && attacked) {
          ctx.fillStyle = NPC_INFO[t].tapeColor;
          ctx.fillRect(offset + TILE_SIZE * j, tickerStartY(i), TILE_SIZE, TILE_SIZE);
        } else if (
          isBlob(t) &&
          i >= 3 &&
          (this.tape[i - 3][j] & 0xff)
        ) {
          // blobs deal damage 3 ticks after their attack roll
          ctx.fillStyle = "black";
          ctx.fillRect(offset + TILE_SIZE * j, tickerStartY(i), TILE_SIZE, TILE_SIZE);
        }
      }
    }
    // ticker tape selection
    if (this.tapeSelectionRange?.length) {
      ctx.fillStyle = "yellow";
      ctx.globalAlpha = 0.25;
      const tapeStartY = this.tapeSelectionRange[0];
      const tapeEndY =
        this.tapeSelectionRange.length >= 2 ? this.tapeSelectionRange[1] : tapeStartY + 1;
      ctx.fillRect(
        offset,
        tickerStartY(tapeStartY),
        TILE_SIZE * TICKER_WIDTH,
        (tapeEndY - tapeStartY) * TILE_SIZE,
      );
      ctx.globalAlpha = 1;
    }
  }

  // exposed for testing
  public _setSelected(s: Coordinates, _mode: number) {
    this.selected = s;
    this.cursorLocation = s;
    this.mode = _mode as NpcType;
  }

  public _getMobs() {
    return this.mobs;
  }
}

export type Coordinates = [number, number];

export type MobX = number;
export type MobY = number;
export type MobType = number;
export type MobSpawnX = number;
export type MobSpawnY = number;
export type MobCooldown = number;
export type Mob = [MobX, MobY, MobType, MobSpawnX, MobSpawnY, MobCooldown];
export type MobSpec = [MobSpawnX, MobSpawnY, MobType];

// each entry corresponds to a value for the mob in that position.
// first 8 bits = attacked flag
// next 8 bits = unused
// next 8 bits = mob x
// next 8 bits = mob y
export type TapeEntry = number[];

export type ReplayData = {
  mobSpecs: MobSpec[];
  playerPositions: Coordinates[];
};

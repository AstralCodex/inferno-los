export type Coordinates = [number, number];

export type MobX = number;
export type MobY = number;
export type MobType = number;
export type MobSpawnX = number;
export type MobSpawnY = number;
export type MobCooldown = number;
// Index of the pillar a nibbler is assigned to walk to; unset for other
// npcs and for nibblers that just head for their nearest standing pillar.
export type MobAssignedPillar = number;
export type Mob = [
  MobX,
  MobY,
  MobType,
  MobSpawnX,
  MobSpawnY,
  MobCooldown,
  MobAssignedPillar?,
];
export type MobSpec = [MobSpawnX, MobSpawnY, MobType, MobAssignedPillar?];

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

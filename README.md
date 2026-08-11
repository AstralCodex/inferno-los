# Inferno LOS Tool

A line-of-sight and NPC pathing simulator for the [Inferno](https://oldschool.runescape.wiki/w/Inferno) in Old School RuneScape.

Place NPCs on the map, move the player around, and step the simulation tick by tick to practice safespotting, wave spawns, and pillar positioning. Supports loading waves 1-66 with randomised spawns, the meleer's dig special, toggling individual pillars, flipping between the north and south viewpoint, and sharing setups or full replays via URL (old-format spawn URLs from the original tool still work).

Originally written by [Backseat](https://bistools.github.io/inferno.html) and [iFreedive](https://github.com/iFreedive-OSRS/ifreedive-osrs.github.io); this version is restructured on the architecture of [Supalosa's Colosseum LOS tool](https://github.com/Supalosa/osrs-colosseum) (itself a descendant of the same code) as a Vite + React + TypeScript app with a test suite.

## Installation

    npm install

## Development

    npm run dev

Then navigate to http://localhost:5173

## Testing

    npm run test

## Building

    npm run build

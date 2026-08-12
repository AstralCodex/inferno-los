import {
  CSSProperties,
  MouseEventHandler,
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { LineOfSight } from "./lineOfSight";

import "./App.css";
import { NPC_TYPES, NpcType, PILLAR_NAMES } from "./constants";

function App() {
  const [isDragging, setDragging] = useState(false);
  const [waveInput, setWaveInput] = useState("");

  const [lineOfSight, setLineOfSight] = useState<LineOfSight | null>(null);

  useSyncExternalStore(
    (s) => {
      lineOfSight?.subscribe(s);
      return () => lineOfSight?.unsubscribe(s);
    },
    () => lineOfSight?.getUiState(),
  );

  const uiState = lineOfSight?.getUiState();

  const currentReplayLength = uiState?.replayLength;
  const isReplaying = uiState?.isReplaying;
  const canSaveReplay = uiState?.canSaveReplay;
  const replayTick = uiState?.replayTick;

  function handleCanvas(canvas: HTMLCanvasElement | null) {
    if (lineOfSight) {
      return;
    }
    if (!canvas) {
      return;
    }
    const newLos = new LineOfSight();
    newLos.initDOM(canvas);
    setLineOfSight(newLos);
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) {
        return;
      }
      lineOfSight?.handleKeyDown(e);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [lineOfSight]);

  const handleMaybeDrop = () => {
    if (isDragging) {
      lineOfSight?.place();
    }
    setDragging(false);
  };

  const DraggableUnitButton = useCallback(
    (
      props: UnitButtonProps & {
        mode: NpcType;
      },
    ) => {
      const { mode } = props;
      return (
        <UnitButton
          {...props}
          onMouseDown={(e) => {
            lineOfSight?.setMode(mode);
            setDragging(true);
            e.preventDefault();
          }}
          onClick={(e) => {
            lineOfSight?.setMode(mode, true);
            setDragging(true);
            e.preventDefault();
            e.stopPropagation();
          }}
        />
      );
    },
    [lineOfSight],
  );

  const ToggleButton = ({
    pressed,
    onClick,
    tooltip,
    children,
  }: {
    pressed: boolean | undefined;
    onClick: () => void;
    tooltip?: string;
    children: React.ReactNode;
  }) => (
    <button
      aria-pressed={pressed ? "true" : "false"}
      onClick={onClick}
      aria-label={tooltip}
      data-microtip-position="bottom"
      role={tooltip ? "tooltip" : undefined}
    >
      {children}
    </button>
  );

  return (
    <>
      <div className="frame units-frame" onMouseUp={() => setDragging(false)}>
        <div className="controls-column">
          <div className="controls-row">
            <button onClick={() => lineOfSight?.remove()}>Clear</button>
            <button onClick={() => lineOfSight?.place()}>Place NPC</button>
            <button
              onClick={() => lineOfSight?.meleeDig()}
              aria-label="Move all meleers to their dig position next to the player"
              data-microtip-position="bottom"
              role="tooltip"
            >
              Melee Dig
            </button>
          </div>
        </div>
        <div className="units-column">
          <div className="units-row">
            <DraggableUnitButton
              mode={NPC_TYPES.BAT}
              image="./bat-north.png"
              borderColor="grey"
              tooltip="Place a Bat (Jal-MejRah) by dragging onto the map. Hotkey: b"
            />
            <DraggableUnitButton
              mode={NPC_TYPES.BLOB_1}
              image="./blob-north.png"
              borderColor="yellow"
              tooltip="Place a Blob (Jal-Ak) by dragging onto the map. Hotkey: a"
            />
            <DraggableUnitButton
              mode={NPC_TYPES.BLOB_2}
              image="./blob-north.png"
              borderColor="blue"
              tooltip="Place a second Blob (Jal-Ak) by dragging onto the map."
            />
            <DraggableUnitButton
              mode={NPC_TYPES.MELEE}
              image="./melee-north.png"
              borderColor="orange"
              tooltip="Place a Meleer (Jal-ImKot) by dragging onto the map. Hotkey: m"
            />
            <DraggableUnitButton
              mode={NPC_TYPES.RANGER}
              image="./ranger-north.png"
              borderColor="lime"
              tooltip="Place a Ranger (Jal-Xil) by dragging onto the map. Hotkey: r"
            />
            <DraggableUnitButton
              mode={NPC_TYPES.MAGER}
              image="./mager-north.png"
              borderColor="red"
              tooltip="Place a Mager (Jal-Zek) by dragging onto the map. Hotkey: z"
            />
            <DraggableUnitButton
              mode={NPC_TYPES.NIBBLER}
              image="./nibbler.png"
              borderColor="red"
              tooltip="Place a Nibbler (Jal-Nib) by dragging onto the map. Hotkey: u"
            />
          </div>
        </div>
      </div>

      <div className="frame">
        <span>Toggle:</span>
        <ToggleButton
          pressed={!uiState?.south}
          onClick={() => lineOfSight?.toggleNS()}
          tooltip="Flip the map between the north and south viewpoint"
        >
          N/S
        </ToggleButton>
        {PILLAR_NAMES.map((name, i) => (
          <ToggleButton
            key={name}
            pressed={
              [uiState?.pillarWest, uiState?.pillarNorth, uiState?.pillarSouth][i]
            }
            onClick={() => lineOfSight?.togglePillar(i)}
            tooltip={`Toggle the ${name.toLowerCase()} pillar`}
          >
            {name}
          </ToggleButton>
        ))}
        <ToggleButton
          pressed={uiState?.showPlayerLoS}
          onClick={() => lineOfSight?.togglePlayerLoS()}
          tooltip="Show the currently selected unit's Line of Sight"
        >
          LoS
        </ToggleButton>
        <ToggleButton
          pressed={uiState?.showSpawns}
          onClick={() => lineOfSight?.toggleSpawns()}
          tooltip="Show the NPC spawn zones"
        >
          Spawns
        </ToggleButton>
        <ToggleButton
          pressed={uiState?.showNibblerSpawn}
          onClick={() => lineOfSight?.toggleNibblerSpawn()}
          tooltip="Show the nibbler spawn zone"
        >
          Nib Spawn
        </ToggleButton>
        <ToggleButton
          pressed={uiState?.showStartTiles}
          onClick={() => lineOfSight?.toggleStartTiles()}
          tooltip="Show the named starting tiles (xZact, Kelvino, Aatykon)"
        >
          Start Tiles
        </ToggleButton>
        <input
          className="wave-input"
          type="number"
          placeholder="Wave #"
          min={1}
          max={66}
          value={waveInput}
          onChange={(e) => setWaveInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              lineOfSight?.loadWave(parseInt(waveInput));
            }
          }}
        />
        <button onClick={() => lineOfSight?.loadWave(parseInt(waveInput))}>
          GO
        </button>
      </div>

      <div className="frame">
        <button onClick={() => lineOfSight?.copySpawnURL()}>
          Copy Spawn URL
        </button>
        <button
          id="copyReplayUrlButton"
          disabled={!canSaveReplay}
          onClick={() => lineOfSight?.copyReplayURL()}
          aria-label="Copy the current tick diagram as replay (or select a segment). Max 32 ticks"
          data-microtip-position="bottom"
          role="tooltip"
        >
          Copy Replay URL
        </button>
        <button
          id="exportReplayButton"
          disabled={!canSaveReplay}
          onClick={() => lineOfSight?.exportReplay()}
          aria-label="Export .webm animation of the replay"
          data-microtip-position="bottom"
          role="tooltip"
        >
          Export Video
        </button>
        <span id="replayIndicator">
          {currentReplayLength ? (
            <strong>
              <span style={{ color: "#FF0000" }}>
                Replay: Tick {replayTick} / {currentReplayLength}
              </span>
            </strong>
          ) : null}
        </span>
        Controls:
        <button
          onClick={() => lineOfSight?.reset()}
          title="hotkey: down or mousewheel up"
        >
          &laquo; Reset
        </button>
        <button
          onClick={() => lineOfSight?.toggleAutoReplay()}
          id="replayAutoButton"
          hidden={currentReplayLength === null}
        >
          {isReplaying ? "Pause" : "Play"}
        </button>
        <button
          onClick={() => lineOfSight?.step(true)}
          title="hotkey: up or mousewheel down"
        >
          Step
        </button>
      </div>
      <canvas
        id="map"
        ref={handleCanvas}
        onSelect={() => false}
        onContextMenu={(e) => e.preventDefault()}
        onMouseDown={(e) => lineOfSight?.onCanvasMouseDown(e)}
        onMouseUp={(e) => {
          lineOfSight?.onCanvasMouseUp(e);
          handleMaybeDrop?.();
        }}
        onDoubleClick={(e) => lineOfSight?.onCanvasDblClick(e)}
        onWheel={(e) => lineOfSight?.onCanvasMouseWheel(e)}
        onMouseMove={(e) => lineOfSight?.onCanvasMouseMove(e)}
        onMouseOut={() => lineOfSight?.onCanvasMouseOut()}
      />
      <p className="footer">
        Originally written by{" "}
        <a href="https://bistools.github.io/inferno.html">Backseat</a> and{" "}
        <a href="https://github.com/iFreedive-OSRS/ifreedive-osrs.github.io">
          iFreedive
        </a>
        , modernised using the structure of{" "}
        <a href="https://github.com/Supalosa/osrs-colosseum">
          Supalosa's Colosseum tool
        </a>
.
        <br />
        <a href="https://github.com/AstralCodex/inferno-los/issues">
          [Issue tracker]
        </a>
      </p>
    </>
  );
}

type UnitButtonProps = {
  onMouseDown?: MouseEventHandler;
  onClick?: MouseEventHandler;
  image?: string;
  label?: React.ReactNode;
  overlay?: React.ReactNode;
  borderColor: CSSProperties["color"];
  tooltip: string;
  width?: number;
  height?: number;
};

const UnitButton = ({
  onMouseDown,
  onClick,
  image,
  label = null,
  overlay = null,
  borderColor,
  tooltip,
  width = 64,
  height = 64,
}: UnitButtonProps) => {
  return (
    <button
      className="UnitButton"
      onMouseDown={onMouseDown}
      onClick={onClick}
      style={{ borderColor, width, height, textAlign: "center", padding: 0 }}
      aria-label={tooltip}
      data-microtip-position="bottom"
      role="tooltip"
    >
      {overlay && <div className="overlay">{overlay}</div>}
      {image && <img src={image} height="50" draggable="false" />}
      {label}
    </button>
  );
};

export default App;

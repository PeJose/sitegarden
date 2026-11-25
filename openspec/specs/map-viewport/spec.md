# map-viewport Specification

## Purpose
Defines how the owner pans and zooms the garden map with mouse, trackpad and touch, how far the map can move, and how pins stay attached to their places in the world.

## Requirements

### Requirement: Pan and zoom by mouse, trackpad and touch
The map SHALL pan by dragging (mouse or one finger) and zoom by wheel, trackpad pinch and two-finger pinch, around the pointer or the pinch centre, within the min zoom for the window and the max zoom of the tile levels.

#### Scenario: Wheel zoom around the cursor
- **WHEN** the owner scrolls to zoom in with the cursor over a plot
- **THEN** that plot stays under the cursor while the map zooms

### Requirement: The map never leaves the tiled area
The viewport SHALL stay inside the pan extent from `panExtent` at every zoom and hero state, without overshooting and snapping back.

#### Scenario: Drag past the edge
- **WHEN** the owner drags the map far beyond the world's edge
- **THEN** the map stops at the extent edge and no untiled area becomes visible

### Requirement: Animated moves
Fly-to (selecting a plot), the zoom buttons and the hero panel slide SHALL move the viewport with the same timing and easing as before this change.

#### Scenario: Click a plot in the sidebar
- **WHEN** the owner clicks a plot name
- **THEN** the map flies to it as before and the first flight after a refresh is as smooth as later ones

### Requirement: Pins stay attached
Pins SHALL stay at their world positions during and after pan and zoom, and clicks on a pin or on empty map SHALL behave as before.

#### Scenario: Zoom with pins visible
- **WHEN** the owner zooms in and out over pins
- **THEN** every pin stays on its building and selecting a pin opens its popover

### Requirement: A broken extension does not break the map
When an extension throws while rendering, the app SHALL show a small failure card naming the extension in its place and SHALL keep rendering every other extension.

#### Scenario: A layer throws
- **WHEN** a map layer extension throws during render
- **THEN** the tiles, pins and other layers still show and a card says which extension failed

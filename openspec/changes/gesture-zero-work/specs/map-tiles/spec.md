# Spec Delta

## ADDED Requirements

### Requirement: Static labels in tiles
Estate and road names SHALL be part of the server-rendered tiles, sized per tile level, and the browser SHALL NOT lay out label text.

#### Scenario: Zoomed-in view
- **WHEN** the owner opens the map at a street-level zoom
- **THEN** estate and road names are visible as part of the tile images

### Requirement: No recomputation during gestures
While the owner pans or pinches, the browser SHALL only apply the new viewport (GPU draw and CSS transforms) and SHALL NOT re-render components, lay out or restyle the map; sizes and tile levels settle once the gesture has rested for 200 ms.

#### Scenario: Pan on a phone
- **WHEN** the owner pans the map with a finger
- **THEN** no map component re-renders during the pan

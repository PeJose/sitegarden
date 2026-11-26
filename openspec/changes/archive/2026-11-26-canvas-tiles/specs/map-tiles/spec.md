# Spec Delta

## ADDED Requirements

### Requirement: Steady tile display
The browser SHALL draw server tiles, the preview and the paper texture into one canvas from bitmaps decoded once, and SHALL never show an area as blank or blurrier during a zoom or pan when a sharper tile for it was already decoded and is within the cache budget.

#### Scenario: Repeated zoom out on a phone
- **WHEN** the owner pinches in and out repeatedly over the same area on an Android phone
- **THEN** no frame shows the paper or preview where a tile was drawn before, and no tile is fetched twice

### Requirement: Bounded decoded memory
The browser SHALL keep decoded tile bitmaps within a fixed pixel budget, evicting the least recently drawn bitmaps that were not drawn in the last frame.

#### Scenario: Long session
- **WHEN** the owner browses the whole map for a long time
- **THEN** decoded bitmaps stay within the budget and the visible area stays drawn

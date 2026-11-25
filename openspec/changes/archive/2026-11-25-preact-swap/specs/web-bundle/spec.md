# Spec Delta

## Purpose

Keeps the first page load small enough for a mid-range phone on a slow connection, so the map's code arrives before its tiles do.

## ADDED Requirements

### Requirement: Small main bundle
The production main JavaScript chunk SHALL be at most 50 KB gzip, and the app SHALL ship one UI runtime only (no React alongside Preact).

#### Scenario: Production build
- **WHEN** `pnpm build` runs
- **THEN** the main chunk is at most 50 KB gzip and contains no React runtime

### Requirement: Same app on the smaller runtime
The map, panels, command bar, status strip and popover SHALL look and behave as before the runtime change, with no console errors.

#### Scenario: Still screenshots
- **WHEN** the `light-still` and `night-still` perf scenarios run
- **THEN** the screenshot diff passes and the page logs no errors

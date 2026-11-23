# Spec Delta

## Purpose

Keeps the garden map cheap to leave open and smooth to move: a measurable budget for idle cost and pan/zoom frame rate, and a repeatable way to check it.

## ADDED Requirements

### Requirement: Idle map costs near-zero GPU
With the map fully loaded and no user input, the client SHALL repaint only the on-screen boxes of active animations (never a world- or viewport-sized layer), and Chrome's GPU process SHALL stay under 10% CPU on the reference laptop (production build, light and night).

#### Scenario: Nothing active
- **WHEN** no node is down and no flow runs, all visible tiles are loaded, and there is no input for 10 s
- **THEN** a 10 s trace shows no recurring paint frames and the GPU process stays under 10% CPU

#### Scenario: Design scene, night
- **WHEN** `?theme=night&still=1` (one site down, one deploy running) is idle for 10 s
- **THEN** paints are limited to the down pin's pulse and the deploy edge's own bounds, and the GPU process stays under 10% CPU

### Requirement: Animations run only while something moves
Ambient and flow animations (deploy lanterns, marching paths, down pulses, twinkles, flicker) SHALL run only while their cause is active and the tab is visible, and SHALL NOT run at all under `prefers-reduced-motion: reduce`.

#### Scenario: Deploy flow ends
- **WHEN** a deploy flow on an edge finishes
- **THEN** that edge's animation stops and no frames are drawn for it afterwards

#### Scenario: Hidden tab
- **WHEN** the tab is hidden
- **THEN** no animation frames are produced until it is visible again

#### Scenario: Reduced motion
- **WHEN** the OS requests reduced motion
- **THEN** status is still shown by colour, shape and label, with no animation

### Requirement: Pan and zoom stay smooth
Panning and wheel/pinch zoom over the loaded map SHALL hold at least 55 fps on the reference laptop and at least 50 fps on a mid-range phone (Chrome DevTools 4× CPU throttle as the stand-in), production build.

#### Scenario: Pan on laptop
- **WHEN** the map is dragged continuously for 3 s at a zoom showing level-2 tiles
- **THEN** the trace shows ≥ 55 fps and no long task over 50 ms

#### Scenario: Pan with throttled CPU
- **WHEN** the same pan runs with 4× CPU throttling
- **THEN** the trace shows ≥ 50 fps

### Requirement: Performance is measured the same way every time
The repository SHALL contain a written profiling procedure and a results log with the baseline and each fix's numbers, so a later change can re-run it and compare.

#### Scenario: Re-running the check
- **WHEN** a contributor follows the procedure on the production build
- **THEN** they get idle GPU %, pan fps and long-task totals comparable to the logged baseline

### Requirement: Performance fixes do not change the look
Performance fixes SHALL NOT visibly change the map compared with the v4.2 Light and Night boards, and SHALL keep every existing animation (twinkle, flicker, lanterns, marching paths, pulses, wash fade) with its current look and timing.

#### Scenario: Side-by-side check
- **WHEN** screenshots of `?still=1` in light and night are taken before and after the change at the same viewport
- **THEN** they match apart from animation phase

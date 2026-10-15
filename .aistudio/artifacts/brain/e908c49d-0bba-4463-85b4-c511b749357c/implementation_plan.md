# UI Reorganization, 3D Layer Painting Fix & Floating Mannequin HUD

A comprehensive plan to resolve 3D painting jumping across layers, reorganize the workspace by moving filters to a left slide-out drawer, place a semi-transparent body mannequin in the canvas top-right corner, remove the redundant selection panel, and introduce a skin model selection dialog upon import or creation.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The following user preferences were confirmed during clarification:
> - **3D Layer Painting**: Paint strictly on the active layer (Base or Outer) without random fallthrough jumping across UV spaces.
> - **Filters Panel**: Slide-out drawer positioned immediately next to the left tool rail, toggled by a dedicated Filters button.
> - **Mannequin Placement & Style**: Semi-transparent floating HUD (`backdrop-filter: blur`, 70% opacity, 100% on hover) positioned in the top-right corner of the canvas stage.
> - **Skin Model Selection**: Choose model type (Classic 4px vs. Slim 3px) once via a clean dialog upon skin import or new skin creation; remove persistent model section from right inspector.
> - **Selection Panel Removal**: Completely remove the Selection section from the right inspector (all selection and moving operations remain accessible via direct canvas interaction and shortcuts).

---

## 1. Overview & Core Concept

- **What It Does**:
  1. **Deterministic 3D Layer Painting**: Fixes 3D raycasting so brush strokes stay strictly on the targeted layer without jumping across the atlas between base and outer regions during strokes.
  2. **Top-Right Floating Mannequin HUD**: Relocates the interactive 2D character puppet and layer buttons (`Both`, `Base`, `Outer`) into a modern, semi-transparent floating widget in the canvas viewport.
  3. **Left Rail Filters Drawer**: Adds a "Filters" icon button to the tool rail that opens an animated slide-out panel for applying effects (Grayscale, Sepia, Hue, Warm, Brightness, etc.) without cluttering the sidebar.
  4. **Skin Model Modal Dialog**: Removes the static inspector model section and prompts for Classic (Steve, 4px arms) or Slim (Alex, 3px arms) upon creating a new skin or opening a PNG file.
  5. **Cleaned Right Inspector**: Retains purely Color and Tool settings, creating a clean, focused editing environment.
- **Target Persona**: Minecraft skin creators seeking streamlined UI ergonomics, unobstructed canvas space, and reliable 3D layer painting.
- **Key Value**: Eliminates 3D paint displacement bugs, frees up the right inspector, and provides quick limb/layer toggling directly in the viewport.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **3D Layer Painting Flow**:
   - In 3D preview, user selects `Base`, `Outer`, or `Both` from the floating mannequin HUD.
   - When `Base` is active, only base body meshes are rendered/hit-tested. Strokes paint exclusively to base UV atlas zones.
   - When `Outer` is active, only outer overlay meshes are rendered/hit-tested. Strokes paint exclusively to outer overlay UV atlas zones.
   - When `Both` is active, raycaster hits the outer mesh if visible, or base mesh if outer is disabled, without hopping between them mid-stroke.

2. **Canvas Floating Mannequin HUD Flow**:
   - Floats in the top-right corner of `#canvasStage` (`position: absolute; top: 16px; right: 16px`).
   - Styled with frosted obsidian glass (`rgba(17, 20, 26, 0.72)`, `backdrop-filter: blur(10px)`, hairline border).
   - Resting opacity is 70%; transitions to 100% on hover for full clarity.
   - Clicking limb parts toggles visibility in 2D UV overlay and 3D preview simultaneously.
   - Layer segmented buttons (`Both` | `Base` | `Outer`) switch layer mode instantly.

3. **Left Rail Filters Slide-out Drawer Flow**:
   - User clicks the new "Filters" button (`✦ Fx`) in the left tool rail.
   - A 260px slide-out drawer smoothly expands to the right of the rail.
   - User adjusts filter type and strength, previews the change, and applies or cancels.
   - Clicking the tool rail button again, switching tools, or clicking outside closes the drawer.

4. **Model Selection on Import / New Skin Flow**:
   - Clicking "＋ New skin" or uploading a PNG opens a modal:
     - **Classic (4px arms)**: Traditional Minecraft model (Steve).
     - **Slim (3px arms)**: Alex model with 3-pixel wide arms.
   - Clicking a choice applies the model geometry and initializes the canvas.
   - For legacy 64×32 skins, the existing conversion confirmation is preserved.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Strict Layer Isolation in 3D Raycasting**:
  - *Chosen Approach*: When `layer === 'base'`, only base meshes are raycastable. When `layer === 'outer'`, only outer meshes are raycastable. Removed dynamic pixel alpha fallthrough mid-stroke.
  - *Why*: Eliminates coordinate jumping across different texture regions during brush strokes and gives the user full predictable control over where paint lands.
- **Decision 2: Floating HUD in Canvas Stage vs. Topbar**:
  - *Chosen Approach*: Floating widget in the top-right corner of the canvas stage.
  - *Why*: Directly visible next to the skin without obscuring the canvas center, accessible in both 2D texture editing and 3D preview modes.
- **Decision 3: Left Drawer for Filters**:
  - *Chosen Approach*: Flyout drawer docked to the tool rail.
  - *Why*: Keeps filters readily accessible as a tool action while leaving the right sidebar focused on core color and brush parameters.

---

## 4. Technical Architecture & Data Strategy

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                                Workspace Layout                                  │
│                                                                                  │
│  ┌──────────┬──────────┬──────────────────────────────────────────┬───────────┐  │
│  │Tool Rail │ Filters  │               Canvas Area                │ Inspector │  │
│  │          │  Drawer  │                                          │           │  │
│  │ • Pencil │(Slide-out│   ┌───────────────────────────────────┐  │ • Color   │  │
│  │ • Brush  │  panel)  │   │ Canvas / 3D Viewport              │  │   Picker  │  │
│  │ • Fill   │          │   │                                   │  │ • Sliders │  │
│  │ • Picker │          │   │         ┌───────────────────────┐ │  │   (Size,  │  │
│  │ • Eraser │          │   │         │ Floating Mannequin HUD│ │  │    Noise, │  │
│  │ • Select │          │   │         │ [Both][Base][Outer]   │ │  │   Intens.)│  │
│  │ • Lighten│          │   │         │ 2D Puppet (Head/Arms/ │ │  │           │  │
│  │ • Darken │          │   │         │ Legs/Torso toggles)   │ │  │           │  │
│  │ • Filters│          │   │         └───────────────────────┘ │  │           │  │
│  │          │          │   └───────────────────────────────────┘  │           │  │
│  └──────────┴──────────┴──────────────────────────────────────────┴───────────┘  │
│                                                                                  │
│   ┌──────────────────────────────────────────────────────────────────────────┐   │
│   │                    Skin Model Modal Dialog                               │   │
│   │           [ Classic (Steve 4px) ]    [ Slim (Alex 3px) ]                 │   │
│   └──────────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### Key Implementation Steps

1. **Fix 3D Painting Raycasting (`src/preview3d/skinPreview.js`)**:
   - In `getHit(e)`, eliminate alpha fallthrough: when raycasting, filter candidate meshes strictly according to `visibility` and active layer.
   - For `state.layer === 'base'`, test only `!m.userData.overlay`.
   - For `state.layer === 'outer'`, test only `m.userData.overlay`.
   - For `state.layer === 'both'`, test outer meshes first; if none hit, test base meshes. Once a mesh is hit, calculate UV coordinates strictly on that mesh's atlas face.

2. **Move Mannequin to Canvas Top-Right HUD (`src/App.tsx`, `styles.css`)**:
   - Move `#bodyMannequin` from `.inspector` to `.canvas-area .canvas-stage`.
   - Style with `.canvas-mannequin-hud`: `position: absolute; top: 16px; right: 16px; z-index: 10;`.
   - Add frosted backdrop blur, 70% resting opacity, 100% hover opacity, and smooth transitions.

3. **Move Filters to Left Slide-out Drawer (`src/App.tsx`, `src/main.js`, `styles.css`)**:
   - Add `#toolFilters` button in `.tool-rail`.
   - Wrap filters section in `#filtersDrawer` positioned alongside the tool rail with smooth slide-in transition.
   - Wire toggle, outside click, and Escape handlers to open/close drawer.

4. **Remove Selection Section & Model Section from Inspector (`src/App.tsx`)**:
   - Delete `.selection-section` and `.model-section` from the right inspector.
   - Canvas-based selection interactions (move, deselect, clear, shortcuts) remain intact.

5. **Implement Model Selection Dialog (`src/App.tsx`, `src/main.js`)**:
   - Create `#modelModal` dialog in `App.tsx` with Classic vs. Slim cards.
   - Show dialog when "＋ New skin" is clicked or when a new PNG is opened via `#fileInput`.
   - Initialize new project with chosen model geometry and update preview.

6. **Verification & Regression Testing**:
   - Verify `npm test` continues passing.
   - Run `npm run lint` and `compile_applet`.
   - Test 3D drawing consistency across layer toggles.

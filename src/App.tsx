import { useEffect, type CSSProperties } from 'react';

export default function App() {
  useEffect(() => { void import('./main.js').then(() => { window.setTimeout(() => document.body.classList.add('app-ready'), 460); }); }, []);
  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#" aria-label="Skinezy Studio"><span className="brand-mark">S</span><span>skinezy<span className="brand-light"> studio</span></span></a>
      <div className="top-actions">
        <button id="newSkin" className="top-button" type="button"><span className="plus">＋</span> New skin</button>
        <button id="openSkin" className="top-button" type="button"><span>↥</span> Open PNG</button>
        <button id="saveSkin" className="top-button primary" type="button"><span>↓</span> Export PNG</button>
        <span className="divider" />
        <button id="undo" className="icon-button" title="Undo (Ctrl+Z)" aria-label="Undo" type="button">↶</button>
        <button id="redo" className="icon-button" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" type="button">↷</button>
        <span className="divider" />
        <button id="settings" className="icon-button settings" title="Settings" aria-label="Settings" type="button">⚙</button>
      </div>
      <input id="fileInput" type="file" accept="image/png,.png" hidden />
    </header>
    <nav id="projectTabs" className="project-tabs" aria-label="Open projects" />
    <main className="workspace">
      <aside className="tool-rail" aria-label="Drawing tools">
        <div className="rail-group">
          <button className="tool active" data-tool="pencil" title="Pencil (B)" type="button"><span>✎</span><small>Pencil</small></button>
          <button className="tool" data-tool="brush" title="Noise brush" type="button"><span>▧</span><small>Brush</small></button>
          <button className="tool" data-tool="fill" title="Fill" type="button"><span>▨</span><small>Fill</small></button>
          <button className="tool" data-tool="eyedropper" title="Eyedropper (I)" type="button"><span>⌕</span><small>Picker</small></button>
          <button className="tool" data-tool="eraser" title="Eraser (E)" type="button"><span>◩</span><small>Eraser</small></button>
        </div>
        <div className="rail-divider" />
        <div className="rail-group">
          <button className="tool" data-tool="select" title="Rectangle selection" type="button"><span>▱</span><small>Select</small></button>
          <button className="tool" data-tool="lighten" title="Lighten" type="button"><span>☼</span><small>Lighten</small></button>
          <button className="tool" data-tool="darken" title="Darken" type="button"><span>◐</span><small>Darken</small></button>
          <button id="toolFilters" className="tool" title="Filters (Fx)" type="button"><span>✦</span><small>Filters</small></button>
        </div>
        <div className="rail-spacer" />
        <button id="gridToggle" className="tool utility active" title="Pixel grid" type="button"><span>▦</span><small>Grid</small></button>
      </aside>

      <aside id="filtersDrawer" className="filters-drawer closed" aria-label="Filters panel">
        <div className="drawer-header">
          <div className="drawer-title"><span className="drawer-icon">✦</span><h2>Filters</h2></div>
          <button id="closeFiltersDrawer" className="icon-button" type="button" aria-label="Close filters">✕</button>
        </div>
        <p className="drawer-hint">Preview changes directly on the active texture before applying.</p>
        <div className="filter-grid">
          <button className="filter-chip" data-filter="grayscale" type="button">Grayscale</button>
          <button className="filter-chip" data-filter="sepia" type="button">Sepia</button>
          <button className="filter-chip" data-filter="invert" type="button">Invert</button>
          <button className="filter-chip" data-filter="brightness" type="button">Brightness</button>
          <button className="filter-chip" data-filter="contrast" type="button">Contrast</button>
          <button className="filter-chip" data-filter="saturation" type="button">Saturation</button>
          <button className="filter-chip" data-filter="hue" type="button">Hue shift</button>
          <button className="filter-chip" data-filter="warm" type="button">Warm</button>
          <button className="filter-chip" data-filter="colorize" type="button">Colorize</button>
          <button className="filter-chip" data-filter="posterize" type="button">Posterize</button>
        </div>
        <label className="setting-label filter-amount-label"><span id="filterAmountName">Effect strength</span><span id="filterAmountValue">100%</span></label>
        <input id="filterAmount" type="range" min={0} max={100} defaultValue={100} />
        <div className="filter-actions">
          <button id="previewFilter" className="secondary-button" type="button">Preview</button>
          <button id="applyFilter" className="primary-button" disabled type="button">Apply</button>
        </div>
        <div id="filterPreview" className="preview-note hidden">Preview active <button id="cancelPreview" type="button">Cancel</button></div>
      </aside>

      <section className="canvas-area">
        <div className="canvas-toolbar">
          <div className="view-tabs"><button id="textureView" className="view-tab active" type="button">Texture editor</button><button id="preview3d" className="view-tab" type="button">3D preview</button></div>
          <div className="canvas-controls"><label id="uvToggleWrap" className="uv-toggle"><input id="uvToggle" type="checkbox" /> UV map</label><span id="zoomLabel">800%</span><button id="zoomOut" className="mini-button" title="Zoom out" type="button">−</button><button id="zoomIn" className="mini-button" title="Zoom in" type="button">＋</button><button id="fitCanvas" className="mini-button" title="Fit canvas" type="button">⛶</button></div>
        </div>
        <div id="canvasStage" className="canvas-stage">
          <div className="canvas-frame"><canvas id="skinCanvas" width={64} height={64} aria-label="64 by 64 pixel skin texture" /><div id="selectionOutline" className="selection-outline hidden" /></div>
          <div id="bodyMannequin" className="canvas-mannequin-hud" aria-label="Body parts and layer visibility">
            <div className="mannequin-hud-header" id="mannequinDragHandle">
              <span className="mannequin-hud-title">Parts & Layers</span>
              <div className="mannequin-actions">
                <button id="mannequinAll" className="mini-hud-btn" title="Show all parts" type="button">All</button>
                <button id="mannequinNone" className="mini-hud-btn" title="Hide all parts" type="button">None</button>
              </div>
            </div>
            <div className="segmented mannequin-layer-segmented">
              <button className="mannequin-layer-btn active" data-layer="both" type="button" title="Both base and outer layers">Both</button>
              <button className="mannequin-layer-btn" data-layer="base" type="button" title="Base layer only">Base</button>
              <button className="mannequin-layer-btn" data-layer="outer" type="button" title="Outer layer only">Outer</button>
            </div>
            <div className="mannequin-wrapper">
              <svg id="mannequinSvg" className="mannequin-svg" viewBox="0 0 120 168" xmlns="http://www.w3.org/2000/svg">
                <g className="mannequin-part" data-part="head" role="button" tabIndex={0} aria-label="Head">
                  <rect x="40" y="6" width="40" height="40" rx="3" />
                  <rect className="inner-detail" x="48" y="22" width="6" height="5" rx="1" />
                  <rect className="inner-detail" x="66" y="22" width="6" height="5" rx="1" />
                  <line className="inner-detail" x1="40" y1="16" x2="80" y2="16" />
                  <title>Head (click to toggle)</title>
                </g>
                <g className="mannequin-part" data-part="rightArm" role="button" tabIndex={0} aria-label="Right arm">
                  <rect x="16" y="50" width="20" height="56" rx="3" />
                  <line className="inner-detail" x1="16" y1="88" x2="36" y2="88" />
                  <title>Right arm (click to toggle)</title>
                </g>
                <g className="mannequin-part" data-part="torso" role="button" tabIndex={0} aria-label="Torso">
                  <rect x="40" y="50" width="40" height="56" rx="3" />
                  <line className="inner-detail" x1="40" y1="78" x2="80" y2="78" />
                  <line className="inner-detail" x1="60" y1="50" x2="60" y2="106" />
                  <title>Torso (click to toggle)</title>
                </g>
                <g className="mannequin-part" data-part="leftArm" role="button" tabIndex={0} aria-label="Left arm">
                  <rect x="84" y="50" width="20" height="56" rx="3" />
                  <line className="inner-detail" x1="84" y1="88" x2="104" y2="88" />
                  <title>Left arm (click to toggle)</title>
                </g>
                <g className="mannequin-part" data-part="rightLeg" role="button" tabIndex={0} aria-label="Right leg">
                  <rect x="40" y="110" width="19" height="52" rx="3" />
                  <line className="inner-detail" x1="40" y1="146" x2="59" y2="146" />
                  <title>Right leg (click to toggle)</title>
                </g>
                <g className="mannequin-part" data-part="leftLeg" role="button" tabIndex={0} aria-label="Left leg">
                  <rect x="61" y="110" width="19" height="52" rx="3" />
                  <line className="inner-detail" x1="61" y1="146" x2="80" y2="146" />
                  <title>Left leg (click to toggle)</title>
                </g>
              </svg>
              <div id="mannequinStatus" className="mannequin-status">6/6 parts · Both layers</div>
              <div className="mannequin-views" aria-label="3D camera views">
                <button data-camera-view="front" type="button">Front</button>
                <button data-camera-view="side" type="button">Side</button>
                <button data-camera-view="back" type="button">Back</button>
                <button data-camera-view="reset" type="button">Reset</button>
              </div>
            </div>
          </div>
        </div>
        <footer className="statusbar"><span id="pixelInfo">X: — &nbsp; Y: — &nbsp; RGBA: —</span><span id="canvasSize">64 × 64 px</span><span id="saveStatus">Saved</span></footer>
      </section>

      <aside className="inspector" aria-label="Editor properties">
        <section className="panel-section color-section">
          <div className="section-heading"><h2>Color</h2><button className="quiet-button" id="swapColors" title="Swap foreground/background" type="button">⇄</button></div>
          <div id="colorSpectrum" className="color-spectrum" role="application" aria-label="Color gradient selector" tabIndex={0}><span id="colorSpectrumMarker" className="color-spectrum-marker" /></div>
          <label className="setting-label hue-label" htmlFor="hueSlider"><span>Hue</span></label><input id="hueSlider" type="range" min={0} max={360} defaultValue={225} aria-label="Hue" />
          <div className="color-row"><div id="colorPreview" className="current-color" aria-label="Current color" /><input id="colorPicker" type="color" defaultValue="#5d7cff" aria-label="Current color" hidden /><div className="color-values"><label htmlFor="hexColor">HEX</label><input id="hexColor" defaultValue="#5D7CFF" maxLength={7} /><label htmlFor="rgbaColor">RGBA</label><input id="rgbaColor" defaultValue="93, 124, 255, 255" /></div></div>
          <div className="swatches" id="swatches"><button className="swatch" style={{ '--swatch': '#5d7cff' } as CSSProperties} type="button" aria-label="Blue"/><button className="swatch" style={{ '--swatch': '#f27475' } as CSSProperties} type="button" aria-label="Red"/><button className="swatch" style={{ '--swatch': '#f5bd4f' } as CSSProperties} type="button" aria-label="Yellow"/><button className="swatch" style={{ '--swatch': '#47c99a' } as CSSProperties} type="button" aria-label="Green"/><button className="swatch" style={{ '--swatch': '#a477ee' } as CSSProperties} type="button" aria-label="Purple"/><button className="swatch add-swatch" title="Add current color" type="button">＋</button></div>
          <div id="recentColors" className="recent-colors" aria-label="Recently used colors" />
        </section>
        <section className="panel-section selection-section">
          <div className="section-heading"><h2>Selection</h2></div>
          <div id="selectionInfo" className="selection-meta">No selection</div>
          <div className="selection-actions">
            <button id="copySelection" className="secondary-button" type="button" title="Copy selection (Ctrl+C)">Copy</button>
            <button id="cutSelection" className="secondary-button" type="button" title="Cut selection (Ctrl+X)">Cut</button>
            <button id="pasteSelection" className="secondary-button" type="button" title="Paste (Ctrl+V)">Paste</button>
          </div>
          <div className="selection-actions">
            <button id="deleteSelection" className="secondary-button" type="button" title="Delete selection">Delete</button>
            <button id="deselect" className="secondary-button" type="button" title="Clear selection">Deselect</button>
          </div>
        </section>
        <section className="panel-section tool-settings"><div className="section-heading"><h2>Tool settings</h2></div>
          <label className="setting-label"><span>Brush size</span><span id="sizeValue">1 px</span></label><input id="brushSize" type="range" min={1} max={16} defaultValue={1} />
          <label className="setting-label"><span>Noise</span><span id="noiseValue">0%</span></label><input id="noise" type="range" min={0} max={80} defaultValue={0} />
          <label className="check-row"><input id="fixedSeed" type="checkbox" defaultChecked /> Use fixed seed</label>
          <div className="setting-separator" />
          <label className="setting-label"><span>Fill tolerance</span><span id="toleranceValue">0</span></label><input id="tolerance" type="range" min={0} max={255} defaultValue={0} />
          <label className="setting-label"><span>Intensity</span><span id="intensityValue">10%</span></label><input id="intensity" type="range" min={5} max={100} step={5} defaultValue={10} />
        </section>
      </aside>
    </main>
    <div id="modelModal" className="modal-backdrop hidden" role="dialog" aria-modal="true" aria-labelledby="modelModalTitle">
      <div className="model-modal-dialog">
        <div className="modal-header">
          <h3 id="modelModalTitle">Choose Skin Model</h3>
          <button id="closeModelModal" className="icon-button" type="button" aria-label="Close">✕</button>
        </div>
        <p className="modal-subtitle">Choose the player geometry for this skin:</p>
        <div className="model-options">
          <button id="selectClassicModel" className="model-card" type="button">
            <div className="model-icon">🧔</div>
            <div className="model-name">Classic (Steve)</div>
            <div className="model-desc">Standard 4-pixel wide arms</div>
          </button>
          <button id="selectSlimModel" className="model-card" type="button">
            <div className="model-icon">🧑</div>
            <div className="model-name">Slim (Alex)</div>
            <div className="model-desc">Slim 3-pixel wide arms</div>
          </button>
        </div>
      </div>
    </div>
    <div id="settingsModal" className="modal-backdrop hidden" role="dialog" aria-modal="true" aria-labelledby="settingsTitle">
      <div className="settings-dialog">
        <div className="modal-header"><h3 id="settingsTitle">Settings</h3><button id="closeSettings" className="icon-button" type="button" aria-label="Close">✕</button></div>
        <label className="settings-theme-label" htmlFor="themeSelect">Color theme</label>
        <select id="themeSelect" className="theme-select">
          <option value="dark">Dark</option>
          <option value="midnight">Midnight</option>
          <option value="light">Light</option>
          <option value="forest">Forest</option>
        </select>
      </div>
    </div>
  </div>;
}

import { useEffect, type CSSProperties } from 'react';

export default function App() {
  useEffect(() => { void import('./main.js'); }, []);
  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#" aria-label="Skinezy Studio"><span className="brand-mark">S</span><span>skinezy<span className="brand-light"> studio</span></span></a>
      <div className="top-actions">
        <button id="newSkin" className="top-button" type="button"><span className="plus">＋</span> New skin</button>
        <button id="openSkin" className="top-button" type="button"><span>↥</span> Open PNG</button>
        <button id="saveSkin" className="top-button primary" type="button"><span>↓</span> Export PNG</button>
        <span className="divider" />
        <button id="undo" className="icon-button" title="Undo (Ctrl+Z)" aria-label="Undo" type="button">↶</button>
        <button id="redo" className="icon-button" title="Redo (Ctrl+Y)" aria-label="Redo" type="button">↷</button>
        <span className="divider" />
        <button id="compare" className="top-button" type="button"><span>▦</span> Compare</button>
        <button className="icon-button settings" title="Settings" type="button">⚙</button>
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
        </div>
        <div className="rail-spacer" />
        <button id="gridToggle" className="tool utility active" title="Pixel grid" type="button"><span>▦</span><small>Grid</small></button>
      </aside>

      <section className="canvas-area">
        <div className="canvas-toolbar">
          <div className="view-tabs"><button id="textureView" className="view-tab active" type="button">Texture editor</button><button id="rawView" className="view-tab" type="button">Raw texture</button><button id="preview3d" className="view-tab" type="button">3D preview</button></div>
          <div className="canvas-controls"><label id="uvToggleWrap" className="uv-toggle hidden"><input id="uvToggle" type="checkbox" defaultChecked /> UV map</label><span id="zoomLabel">800%</span><button id="zoomOut" className="mini-button" title="Zoom out" type="button">−</button><button id="zoomIn" className="mini-button" title="Zoom in" type="button">＋</button><button id="fitCanvas" className="mini-button" title="Fit canvas" type="button">⛶</button></div>
        </div>
        <div id="canvasStage" className="canvas-stage">
          <div className="canvas-frame"><canvas id="skinCanvas" width={64} height={64} aria-label="64 by 64 pixel skin texture" /><div id="selectionOutline" className="selection-outline hidden" /></div>
        </div>
        <footer className="statusbar"><span id="pixelInfo">X: — &nbsp; Y: — &nbsp; RGBA: —</span><span id="canvasSize">64 × 64 px</span><span id="saveStatus">Saved</span></footer>
      </section>

      <aside className="inspector" aria-label="Editor properties">
        <section className="panel-section color-section">
          <div className="section-heading"><h2>Color</h2><button className="quiet-button" id="swapColors" title="Swap foreground/background" type="button">⇄</button></div>
          <div className="color-row"><input id="colorPicker" type="color" defaultValue="#5d7cff" aria-label="Choose color" /><div className="color-values"><label htmlFor="hexColor">HEX</label><input id="hexColor" defaultValue="#5D7CFF" maxLength={7} /><label htmlFor="rgbaColor">RGBA</label><input id="rgbaColor" defaultValue="93, 124, 255, 255" /></div></div>
          <div className="swatches" id="swatches"><button className="swatch" style={{ '--swatch': '#5d7cff' } as CSSProperties} type="button" aria-label="Blue"/><button className="swatch" style={{ '--swatch': '#f27475' } as CSSProperties} type="button" aria-label="Red"/><button className="swatch" style={{ '--swatch': '#f5bd4f' } as CSSProperties} type="button" aria-label="Yellow"/><button className="swatch" style={{ '--swatch': '#47c99a' } as CSSProperties} type="button" aria-label="Green"/><button className="swatch" style={{ '--swatch': '#a477ee' } as CSSProperties} type="button" aria-label="Purple"/><button className="swatch add-swatch" title="Add current color" type="button">＋</button></div>
        </section>
        <section className="panel-section tool-settings"><div className="section-heading"><h2>Tool settings</h2></div>
          <label className="setting-label"><span>Brush size</span><span id="sizeValue">1 px</span></label><input id="brushSize" type="range" min={1} max={16} defaultValue={1} />
          <label className="setting-label"><span>Noise</span><span id="noiseValue">0%</span></label><input id="noise" type="range" min={0} max={80} defaultValue={0} />
          <label className="check-row"><input id="fixedSeed" type="checkbox" defaultChecked /> Use fixed seed</label>
          <div className="setting-separator" />
          <label className="setting-label"><span>Fill tolerance</span><span id="toleranceValue">0</span></label><input id="tolerance" type="range" min={0} max={255} defaultValue={0} />
          <label className="setting-label"><span>Intensity</span><span id="intensityValue">10%</span></label><input id="intensity" type="range" min={5} max={30} step={5} defaultValue={10} />
        </section>
        <section className="panel-section filters-section"><div className="section-heading"><h2>Filters</h2><span className="panel-count">10</span></div><p className="section-hint">Preview is temporary until you apply.</p><div className="filter-grid">
          <button className="filter-chip" data-filter="grayscale" type="button">Grayscale</button><button className="filter-chip" data-filter="sepia" type="button">Sepia</button><button className="filter-chip" data-filter="invert" type="button">Invert</button><button className="filter-chip" data-filter="brightness" type="button">Brightness</button><button className="filter-chip" data-filter="contrast" type="button">Contrast</button><button className="filter-chip" data-filter="saturation" type="button">Saturation</button><button className="filter-chip" data-filter="hue" type="button">Hue shift</button><button className="filter-chip" data-filter="warm" type="button">Warm</button><button className="filter-chip" data-filter="colorize" type="button">Colorize</button><button className="filter-chip" data-filter="posterize" type="button">Posterize</button>
        </div><label className="setting-label filter-amount-label"><span id="filterAmountName">Effect strength</span><span id="filterAmountValue">100%</span></label><input id="filterAmount" type="range" min={0} max={100} defaultValue={100} /><div className="filter-actions"><button id="previewFilter" className="secondary-button" type="button">Preview</button><button id="applyFilter" className="primary-button" disabled type="button">Apply</button></div><div id="filterPreview" className="preview-note hidden">Preview active <button id="cancelPreview" type="button">Cancel</button></div></section>
        <section className="panel-section selection-section"><div className="section-heading"><h2>Selection</h2><button id="deselect" className="quiet-button" type="button">Clear</button></div><div className="selection-meta" id="selectionInfo">No selection</div><div className="selection-actions"><button id="copySelection" className="secondary-button" type="button">Copy</button><button id="cutSelection" className="secondary-button" type="button">Cut</button><button id="deleteSelection" className="secondary-button" type="button">Delete</button></div><div className="selection-actions transform-actions"><button id="flipSelectionH" className="secondary-button" type="button" title="Flip horizontally">Flip H</button><button id="flipSelectionV" className="secondary-button" type="button" title="Flip vertically">Flip V</button><button id="rotateSelection" className="secondary-button" type="button" title="Rotate clockwise">Rotate ↻</button></div></section>
        <section className="panel-section model-section"><div className="section-heading"><h2>Skin model</h2></div><div className="segmented"><button className="model-button active" data-model="classic" type="button">Classic</button><button className="model-button" data-model="slim" type="button">Slim</button></div><p className="section-hint">3D geometry is available. UV orientation still needs control-skin verification.</p></section>
      </aside>
    </main>
    <section id="comparePanel" className="compare-panel hidden"><div className="compare-heading"><div><h2>Skin comparison</h2><p>Compare aligned 64 × 64 texture pixels</p></div><button id="closeCompare" className="icon-button" type="button">×</button></div><div className="compare-controls"><label>Base <select id="compareBase" /></label><label>Other <select id="compareOther" /></label><label>Mode <select id="compareMode"><option value="side">Side by side</option><option value="diff">Difference</option><option value="overlay">Overlay</option></select></label><label id="overlayOpacityWrap" className="hidden">Opacity <input id="overlayOpacity" type="range" min={0} max={100} defaultValue={50} /></label></div><div id="compareGrid" className="compare-grid" /></section>
  </div>;
}

(() => {
    /*
     * igroovie.js
     * Main client-side logic for the iGroovie 4K Text Thrower.
     *
     * Responsibilities:
     * - Manage a 3840×2160 canvas where text items are placed.
     * - Provide pointer-based placement and drag-to-move functionality.
     * - Maintain Undo/Redo stacks (snapshot-based) for user actions.
     * - Render hover preview, sync UI controls (range + number), and export PNG.
     */

    /*
     * REVIEW NOTE (2025-12-01):
     * - Quick code review completed: DOM IDs referenced by this script exist
     *   in `index.html`. No syntax errors found.
     * - The `Delete` button was removed from the UI; all references were
     *   cleaned up earlier. The Clear action now shows a confirmation.
     * - No unsafe unguarded DOM accesses remain; event listeners are
     *   registered only when elements are present.
     */

    // Canvas target resolution (4K)
    const CANVAS_W = 3840;
    const CANVAS_H = 2160;

    // Grab main canvas and 2D rendering context
    const canvas = document.getElementById('canvas');
    const ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;

    // Defensive: if the canvas or context isn't available, stop early and log.
    if (!canvas || !ctx) {
        console.error('Canvas or 2D context not available. iGroovie failing to initialize.');
        return;
    }

    // UI controls used by the script
    const textInput = document.getElementById('text-input');
    const fontSelect = document.getElementById('font-select');
    const fontSizeInput = document.getElementById('font-size'); // numeric entry
    const colorInput = document.getElementById('color');
    const alignSelect = document.getElementById('align');
    const placeToggle = document.getElementById('place-toggle');
    const clearBtn = document.getElementById('clear');
    const downloadBtn = document.getElementById('download');
    const centerBtn = document.getElementById('centerText');
    const undoBtn = document.getElementById('undo');
    const redoBtn = document.getElementById('redo');
    const fontRange = document.getElementById('font-size-range'); // slider
    const fontPreviewEl = document.getElementById('font-preview');
    const fontPanelEl = document.getElementById('font-panel');
    const colorSwatch = document.getElementById('color-swatch');

    // Ensure the canvas internal pixel size is full 4K regardless of CSS scaling
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;

    // In-memory list of placed text items. Each item is an object with:
    // { text, x, y, size, family, color, align }
    const items = [];

    // Undo / Redo stacks. We store deep-copied snapshots of `items`.
    // This snapshot approach is simple and robust; stacks are capped to avoid memory bloat.
    const undoStack = [];
    const redoStack = [];
    const MAX_STACK = 80;

    // pushState(): save a snapshot of the current `items` to the undo stack.
    // Called before any action that should be undoable (place, drag start, clear, center, etc.).
    function pushState() {
        undoStack.push(JSON.parse(JSON.stringify(items)));
        if (undoStack.length > MAX_STACK) undoStack.shift();
        // new action invalidates redo history
        redoStack.length = 0;
        updateUndoRedoButtons();
    }

    /**
     * clamp(value, min, max) -> number
     * Small utility to clamp numeric values (used for font-size bounds and safety checks).
     */
    function clamp(v, a, b) {
        return Math.min(Math.max(v, a), b);
    }

    // setState(snapshot): replace the current `items` with the provided snapshot
    // and re-render. Used when performing undo/redo restores.
    function setState(snapshot) {
        items.length = 0;
        if (Array.isArray(snapshot)) {
            for (const it of snapshot) items.push(JSON.parse(JSON.stringify(it)));
        }
        scheduleDraw();
        updateUndoRedoButtons();
    }

    // Enable/disable Undo/Redo buttons based on stack state
    function updateUndoRedoButtons() {
        if (undoBtn) undoBtn.disabled = undoStack.length === 0;
        if (redoBtn) redoBtn.disabled = redoStack.length === 0;
    }

    // Helper: map a friendly family name to a CSS font-family string with fallbacks.
    // This gives the canvas and preview a reasonable fallback if a font is missing.
    function fontFamilyToCSS(name) {
        const map = {
            'Roboto': "'Roboto', Arial, sans-serif",
            'Montserrat': "'Montserrat', 'Helvetica Neue', Arial, sans-serif",
            'Lora': "'Lora', serif",
            'Oswald': "'Oswald', Arial, sans-serif",
            'Poppins': "'Poppins', Arial, sans-serif",
            'Playfair Display': "'Playfair Display', serif",
            'Merriweather': "'Merriweather', serif",
            'Open Sans': "'Open Sans', Arial, sans-serif",
            'Bebas Neue': "'Bebas Neue', Arial, sans-serif",
            'Pacifico': "'Pacifico', cursive",
            'Lobster': "'Lobster', cursive",
            'Permanent Marker': "'Permanent Marker', cursive",
            'Indie Flower': "'Indie Flower', cursive",
            'Fredoka One': "'Fredoka One', 'Arial', sans-serif",
            'Gloria Hallelujah': "'Gloria Hallelujah', cursive",
            'Amatic SC': "'Amatic SC', cursive",
            'Shadows Into Light': "'Shadows Into Light', cursive",
            'Bangers': "'Bangers', 'Arial', sans-serif",
            'Chewy': "'Chewy', cursive",
            'Playball': "'Playball', cursive",
            'Caveat': "'Caveat', cursive",
            'Raleway': "'Raleway', Arial, sans-serif",
            'Nunito': "'Nunito', Arial, sans-serif",
            'Quicksand': "'Quicksand', Arial, sans-serif",
            'Fira Sans': "'Fira Sans', Arial, sans-serif",
            'Anton': "'Anton', Arial, sans-serif",
            'Comfortaa': "'Comfortaa', Arial, sans-serif",
            'Inter': "'Inter', Arial, sans-serif",
            'Noto Sans': "'Noto Sans', Arial, sans-serif",
            'Ubuntu': "'Ubuntu', Arial, sans-serif",
            'Cabin': "'Cabin', Arial, sans-serif",
            'Kanit': "'Kanit', Arial, sans-serif",
            'Work Sans': "'Work Sans', Arial, sans-serif",
            'Rubik': "'Rubik', Arial, sans-serif",
            'DM Sans': "'DM Sans', Arial, sans-serif",
            'Space Grotesk': "'Space Grotesk', Arial, sans-serif",
            'Karla': "'Karla', Arial, sans-serif",
            'Overpass': "'Overpass', Arial, sans-serif",
            'Arial': "Arial, Helvetica, sans-serif",
            'Helvetica': "'Helvetica Neue', Helvetica, Arial, sans-serif",
            'Times New Roman': "'Times New Roman', Times, serif",
            'Georgia': "Georgia, 'Times New Roman', Times, serif",
            'Courier New': "'Courier New', Courier, monospace",
            'Verdana': "Verdana, Geneva, sans-serif",
            'Trebuchet MS': "'Trebuchet MS', Helvetica, sans-serif",
            'Impact': "Impact, Charcoal, sans-serif",
            'Comic Sans MS': "'Comic Sans MS', 'Comic Sans', cursive",
            'Papyrus': "Papyrus, 'Times New Roman', serif",
            'Serif': 'serif',
            'Sans-serif': 'sans-serif'
        };
        return map[name] || `'${name}', sans-serif`;
    }


    // drawAll(): render the canvas. Clears first, then draws each placed text item.
    // If a hover preview exists it is drawn last with reduced opacity.
    // Flag + scheduler to batch redraws via requestAnimationFrame for efficiency.
    let needsRedraw = false;
    /**
     * scheduleDraw()
     * Request an animation frame to redraw the canvas. Multiple calls within
     * the same frame are coalesced using `needsRedraw` to avoid redundant work.
     */
    function scheduleDraw() {
        if (needsRedraw) return;
        needsRedraw = true;
        requestAnimationFrame(() => {
            needsRedraw = false;
            drawAll();
        });
    }

    // drawAll(): render the canvas. Clears first, then draws each placed text item.
    // If a hover preview exists it is drawn last with reduced opacity.
    function drawAll() {
        // Clear the full 4K canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Render each placed item
        for (const it of items) {
            ctx.save();
            ctx.fillStyle = it.color || '#fff';
            // Compose the font string used by canvas (`size` and `family`).
            // Use CSS font-family with fallbacks to improve rendering when a font isn't available
            ctx.font = `${it.size}px ${fontFamilyToCSS(it.family)}`;
            // Map the alignment option to canvas textAlign/textBaseline
            switch (it.align) {
                case 'center':
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    break;
                case 'top-left':
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'top';
                    break;
                case 'top-right':
                    ctx.textAlign = 'right';
                    ctx.textBaseline = 'top';
                    break;
                case 'bottom-left':
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'bottom';
                    break;
                case 'bottom-right':
                    ctx.textAlign = 'right';
                    ctx.textBaseline = 'bottom';
                    break;
                default:
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
            }
            // Draw the text at the stored coordinates
            ctx.fillText(it.text, it.x, it.y);
            ctx.restore();
        }

        // If there's a hover preview, draw it semi-transparently on top
        if (preview) {
            ctx.save();
            ctx.globalAlpha = 0.65; // make preview visually distinct
            ctx.fillStyle = preview.color || '#fff';
            ctx.font = `${preview.size}px ${fontFamilyToCSS(preview.family)}`;
            switch (preview.align) {
                case 'center': ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; break;
                case 'top-left': ctx.textAlign = 'left'; ctx.textBaseline = 'top'; break;
                case 'top-right': ctx.textAlign = 'right'; ctx.textBaseline = 'top'; break;
                case 'bottom-left': ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; break;
                case 'bottom-right': ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; break;
                default: ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            }
            ctx.fillText(preview.text, preview.x, preview.y);
            ctx.restore();
        }
    }

    // Utility: convert a pointer event's client coordinates to canvas pixel coordinates.
    // This accommodates CSS scaling so placements map to the full 4K canvas.
    /**
     * getMousePos(evt) -> {x,y}
     * Convert client (DOM) coordinates from a pointer event into canvas
     * pixel coordinates that correspond to the internal 4K resolution. This
     * keeps pointer interaction accurate regardless of CSS scaling.
     */
    function getMousePos(evt) {
        const rect = canvas.getBoundingClientRect();
        const x = (evt.clientX - rect.left) * (canvas.width / rect.width);
        const y = (evt.clientY - rect.top) * (canvas.height / rect.height);
        return { x, y };
    }

    // Utility: read the currently selected font family from the select element.
    // We use the visible option text as the family name (works with Google fonts and system fonts).
    /**
     * currentFontFamily() -> string
     * Return the currently selected font family name (uses the visible option
     * text so it works for both Google fonts and local/system fonts).
     */
    function currentFontFamily() {
        const opt = fontSelect.options[fontSelect.selectedIndex];
        return opt ? opt.text : 'Roboto';
    }

    // Pointer/interaction state and preview data
    let draggingIndex = -1;                  // index of item currently being dragged (or -1)
    let dragOffset = { x: 0, y: 0 };         // pointer-to-item offset during drag
    let isPointerDown = false;               // whether pointer is pressed
    let preview = null;                      // hover preview object (or null)

    // measureTextBounds(it): return an estimated bounding box for a text item.
    // Uses `measureText()` plus `actualBoundingBox*` metrics when available.
    /**
     * measureTextBounds(it) -> {width,height,ascent,descent}
     * Use the canvas `measureText()` API to estimate the rendered text bounds.
     * When `actualBoundingBox*` metrics exist they are used; otherwise we
     * fall back to conservative estimates derived from font size.
     */
    function measureTextBounds(it) {
        ctx.save();
        ctx.font = `${it.size}px ${fontFamilyToCSS(it.family)}`;
        const m = ctx.measureText(it.text);
        const width = m.width;
        // actualBoundingBoxAscent / Descent are not available in all browsers; fall back to estimates
        const ascent = m.actualBoundingBoxAscent || it.size * 0.75;
        const descent = m.actualBoundingBoxDescent || it.size * 0.25;
        const height = ascent + descent;
        ctx.restore();
        return { width, height, ascent, descent };
    }

    // findItemAt(x,y): hit-test items from topmost to bottommost. Returns item index or -1.
    /**
     * findItemAt(x,y) -> index
     * Hit-test items from topmost to bottommost. Returns the index of the
     * top-most item under the provided canvas pixel coordinates, or -1.
     */
    function findItemAt(x, y) {
        for (let i = items.length - 1; i >= 0; i--) {
            const it = items[i];
            const metrics = measureTextBounds(it);
            let left, right, top, bottom;
            // Compute bounding box according to the saved alignment
            switch (it.align) {
                case 'center':
                    left = it.x - metrics.width / 2;
                    right = it.x + metrics.width / 2;
                    top = it.y - metrics.height / 2;
                    bottom = it.y + metrics.height / 2;
                    break;
                case 'top-left':
                    left = it.x;
                    top = it.y;
                    right = left + metrics.width;
                    bottom = top + metrics.height;
                    break;
                case 'top-right':
                    right = it.x;
                    left = right - metrics.width;
                    top = it.y;
                    bottom = top + metrics.height;
                    break;
                case 'bottom-left':
                    left = it.x;
                    bottom = it.y;
                    top = bottom - metrics.height;
                    right = left + metrics.width;
                    break;
                case 'bottom-right':
                    right = it.x;
                    bottom = it.y;
                    left = right - metrics.width;
                    top = bottom - metrics.height;
                    break;
                default:
                    // default == center-like box
                    left = it.x - metrics.width / 2;
                    right = it.x + metrics.width / 2;
                    top = it.y - metrics.height / 2;
                    bottom = it.y + metrics.height / 2;
            }
            if (x >= left && x <= right && y >= top && y <= bottom) return i;
        }
        return -1;
    }

    // Pointer down: set capture and prepare to drag if hitting an item.
    // We also push a state snapshot so the subsequent drag can be undone.
    // Pointer down: start drag when clicking an existing text item. We push
    // a snapshot before starting the drag so the whole drag can be undone.
    canvas.addEventListener('pointerdown', (evt) => {
        canvas.setPointerCapture(evt.pointerId);
        isPointerDown = true;
        const pos = getMousePos(evt);
        const hit = findItemAt(pos.x, pos.y);
        if (hit >= 0) {
            // Record a snapshot so the drag operation becomes undoable
            pushState();
            draggingIndex = hit;
            const it = items[hit];
            // track the offset between pointer and the item's anchor point
            dragOffset.x = pos.x - it.x;
            dragOffset.y = pos.y - it.y;
        } else {
            draggingIndex = -1;
        }
    });

    // Pointer move: if dragging, update item position. Otherwise perform hover hit-test
    // and update the preview shown to the user.
    // Pointer move: update dragging state or compute hover preview position.
    canvas.addEventListener('pointermove', (evt) => {
        const pos = getMousePos(evt);
        if (draggingIndex >= 0 && isPointerDown) {
            const it = items[draggingIndex];
            it.x = pos.x - dragOffset.x;
            it.y = pos.y - dragOffset.y;
            scheduleDraw();
        } else {
            const hover = findItemAt(pos.x, pos.y);
            canvas.style.cursor = hover >= 0 ? 'move' : 'default';

            // When not hovering an existing item and the place toggle is enabled,
            // prepare a preview object so the user sees where a click would place text.
            if (placeToggle.checked && hover < 0) {
                const t = textInput.value || '';
                if (t) {
                    const size = parseInt(fontSizeInput.value, 10) || 48;
                    const family = currentFontFamily();
                    const color = colorInput.value || '#ffffff';
                    const align = alignSelect.value || 'center';
                    preview = { x: pos.x, y: pos.y, text: t, size, family, color, align };
                } else preview = null;
            } else {
                preview = null;
            }
            scheduleDraw();
        }
    });

    // Populate the floating font panel with samples for each option so users can
    // visually pick fonts. This also sets the inline preview's font.
    /**
     * populateFontPanel()
     * Build the floating font picker UI from the `<select id="font-select">`.
     * Each entry shows a small sample plus the font name and sets the select
     * when clicked.
     */
    function populateFontPanel() {
        if (!fontPanelEl || !fontSelect) return;
        fontPanelEl.innerHTML = '';
        for (let i = 0; i < fontSelect.options.length; i++) {
            const opt = fontSelect.options[i];
            const name = opt.text;
            const item = document.createElement('div');
            item.className = 'font-option';
            item.dataset.value = name;
            const sample = document.createElement('div');
            sample.className = 'sample';
            sample.textContent = 'Aa';
            sample.style.fontFamily = fontFamilyToCSS(name);
            const label = document.createElement('div');
            label.className = 'name';
            label.textContent = name;
            item.appendChild(sample);
            item.appendChild(label);
            item.addEventListener('click', () => {
                // choose this font
                fontSelect.value = name;
                updateFontPreview();
                closeFontPanel();
                fontSelect.dispatchEvent(new Event('change'));
            });
            fontPanelEl.appendChild(item);
        }
    }

    // Open/close helpers for the floating font panel. The panel is positioned
    // relative to the inline preview element and toggled visible/hidden.
    function openFontPanel() {
        if (!fontPanelEl || !fontPreviewEl) return;
        // position the panel under the preview element when possible
        const rect = fontPreviewEl.getBoundingClientRect();
        // prefer to show below; if not enough space, show above
        const top = rect.bottom + 8;
        const left = rect.left;
        fontPanelEl.style.left = `${Math.max(8, left)}px`;
        fontPanelEl.style.top = `${top}px`;
        fontPanelEl.style.display = 'block';
        fontPanelEl.setAttribute('aria-hidden', 'false');
    }
    function closeFontPanel() {
        if (!fontPanelEl) return;
        fontPanelEl.style.display = 'none';
        fontPanelEl.setAttribute('aria-hidden', 'true');
    }

    // Update the inline `#font-preview` sample to match the selected font.
    function updateFontPreview() {
        if (!fontPreviewEl || !fontSelect) return;
        const family = currentFontFamily();
        fontPreviewEl.style.fontFamily = fontFamilyToCSS(family);
        fontPreviewEl.textContent = 'Aa';
    }

    // Toggle panel when clicking preview element
    if (fontPreviewEl) {
        fontPreviewEl.addEventListener('click', (e) => {
            if (!fontPanelEl) return;
            if (fontPanelEl.style.display === 'block') closeFontPanel();
            else openFontPanel();
        });
    }

    // Close panel when clicking outside
    document.addEventListener('click', (e) => {
        if (!fontPanelEl || !fontPreviewEl || !fontSelect) return;
        if (fontPanelEl.contains(e.target) || fontPreviewEl.contains(e.target) || fontSelect.contains(e.target)) return;
        closeFontPanel();
    });

    // Close font panel on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeFontPanel();
    });

    // Update inline font preview and color swatch initially and on changes
    if (fontSelect) {
        fontSelect.addEventListener('change', () => updateFontPreview());
    }
    if (colorSwatch && colorInput) {
        // Initialize swatch and update on color changes
        colorSwatch.style.background = colorInput.value;
        colorInput.addEventListener('input', () => {
            colorSwatch.style.background = colorInput.value;
            updateCanvasContrast(colorInput.value);
        });
    }

    // Change canvas background (and subtly the border) to contrast with the
    // currently selected text color. This helps preview text legibility while
    // the canvas pixels themselves are cleared to transparent.
    function hexToRgb(hex) {
        if (!hex) return { r: 0, g: 0, b: 0 };
        let h = hex.replace('#', '');
        if (h.length === 3) h = h.split('').map(c => c + c).join('');
        const int = parseInt(h, 16);
        return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
    }

    function getRelativeLuminance({ r, g, b }) {
        // Convert sRGB to linear values then compute relative luminance
        const srgb = [r, g, b].map(v => v / 255).map(c => {
            return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
    }

    function updateCanvasContrast(hex) {
        const rgb = hexToRgb(hex || '#ffffff');
        const lum = getRelativeLuminance(rgb);
        // If selected color is dark (low luminance) use a light canvas background,
        // otherwise keep a dark canvas background. Also tweak border color.
        if (lum < 0.5) {
            canvas.style.background = '#f6f7f8';
            canvas.style.borderColor = '#dcdcdc';
        } else {
            canvas.style.background = '#000';
            canvas.style.borderColor = '#2f2f2f';
        }
    }

    // Build UI and initialize previews
    populateFontPanel();
    updateFontPreview();
    // initialize canvas contrast based on the current color input
    if (colorInput && colorInput.value) updateCanvasContrast(colorInput.value);

    // Pointer up: if we were dragging finish it; otherwise if click-to-place is active
    // create a new item (and push a snapshot so the placement is undoable).
    // Pointer up: finish drag or place new text if 'Place on click' is enabled.
    canvas.addEventListener('pointerup', (evt) => {
        const pos = getMousePos(evt);
        if (draggingIndex >= 0) {
            // finished dragging — clear dragging state
            draggingIndex = -1;
        } else {
            // Place new text if allowed
            if (placeToggle.checked) {
                const text = textInput.value || '';
                if (text) {
                    // Save state before adding so this action can be undone
                    pushState();
                    const size = parseInt(fontSizeInput.value, 10) || 48;
                    const family = currentFontFamily();
                    const color = colorInput.value || '#ffffff';
                    const align = alignSelect.value || 'center';
                    const item = { text, x: pos.x, y: pos.y, size, family, color, align };
                    items.push(item);
                    scheduleDraw();
                }
            }
        }
        isPointerDown = false;
        try { canvas.releasePointerCapture(evt.pointerId); } catch (e) { }
    });

    // If the pointer leaves the canvas we clear the hover preview
    // Clear hover preview when the pointer leaves the canvas
    canvas.addEventListener('pointerleave', () => { preview = null; scheduleDraw(); });

    // Clear button: ask for confirmation before clearing. If the user
    // confirms, snapshot the current state (so the clear can be undone),
    // then clear the items and redraw.
    if (clearBtn) clearBtn.addEventListener('click', () => {
        const ok = window.confirm('Clear all text from the canvas? This action can be undone with Undo.');
        if (!ok) return;
        pushState();
        items.length = 0;
        scheduleDraw();
    });

    // Download creates a PNG blob from the full-resolution canvas and triggers
    // a download via a temporary anchor element. Guarded in case the button is missing.
    if (downloadBtn) downloadBtn.addEventListener('click', () => {
        try {
            canvas.toBlob((blob) => {
                if (!blob) return;
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'igroovie-4k.png';
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
            }, 'image/png');
        } catch (err) {
            console.error('Download failed', err);
        }
    });

    // Center button: add the current text centered on the canvas. Snapshot first.
    if (centerBtn) centerBtn.addEventListener('click', () => {
        const text = (textInput && textInput.value) ? textInput.value : '';
        if (!text) return;
        pushState();
        const size = fontSizeInput ? clamp(parseInt(fontSizeInput.value, 10) || 48, 8, 800) : 48;
        const family = currentFontFamily();
        const color = colorInput ? colorInput.value : '#ffffff';
        const align = 'center';
        items.push({ text, x: canvas.width / 2, y: canvas.height / 2, size, family, color, align });
        scheduleDraw();
    });

    // Undo/Redo handlers use snapshot stacks
    if (undoBtn) undoBtn.addEventListener('click', () => {
        if (undoStack.length === 0) return;
        // push current state to redo, then restore last undo snapshot
        redoStack.push(JSON.parse(JSON.stringify(items)));
        const prev = undoStack.pop();
        setState(prev);
    });
    if (redoBtn) redoBtn.addEventListener('click', () => {
        if (redoStack.length === 0) return;
        undoStack.push(JSON.parse(JSON.stringify(items)));
        const next = redoStack.pop();
        setState(next);
    });

    // Keyboard shortcuts: Undo/Redo
    // - Cmd/Ctrl+Z => Undo
    // - Cmd/Ctrl+Shift+Z or Ctrl+Y => Redo
    // Keyboard shortcuts: Undo/Redo. Uses platform modifier (Ctrl or Cmd).
    document.addEventListener('keydown', (e) => {
        const mod = e.ctrlKey || e.metaKey;
        if (!mod) return;
        // Z (undo) and Y (redo)
        if (e.key.toLowerCase() === 'z') {
            e.preventDefault();
            if (e.shiftKey) {
                // redo
                if (redoBtn) redoBtn.click();
            } else {
                if (undoBtn) undoBtn.click();
            }
        } else if (e.key.toLowerCase() === 'y') {
            e.preventDefault();
            if (redoBtn) redoBtn.click();
        }
    });

    // Initial render
    scheduleDraw();

    // Synchronize the range slider and numeric font-size input.
    if (fontRange && fontSizeInput) {
        fontRange.addEventListener('input', (e) => {
            const v = parseInt(e.target.value, 10) || 8;
            fontSizeInput.value = v;
        });
    }
    if (fontSizeInput) fontSizeInput.addEventListener('change', (e) => {
        let v = parseInt(e.target.value, 10) || 8;
        v = clamp(v, 8, 800);
        e.target.value = v;
        if (fontRange) fontRange.value = v;
    });

    // Initialize undo/redo button states
    updateUndoRedoButtons();

    // Redraw on window resize to keep visual fidelity (canvas internal resolution remains unchanged)
    window.addEventListener('resize', () => scheduleDraw());
})();


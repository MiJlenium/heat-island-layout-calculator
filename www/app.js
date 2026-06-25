(function () {
    "use strict";

    const SOURCE = "S";
    const GENERATOR = "G";
    const RADIATOR = "R";

    const APP_VERSION = "1.2.0.0";
    const APP_VERSION_CODE = 25;
    const FAST_ATTEMPTS_DEFAULT = 1000;
    const BACKGROUND_ATTEMPTS = 10000;
    const BACKGROUND_CHUNK = 500;
    const DEFAULT_ZOOM = 0.5;

    const STORAGE_KEY = "heat_island_optimizer_android_user_saves_v1";
    const LEVEL_MEMORY_KEY = "heat_island_optimizer_android_level_memory_v1";
    const LAST_STATE_KEY = "heat_island_optimizer_android_last_state_v2";
    const LANGUAGE_KEY = "heat_island_optimizer_android_language_v1";
    const UPDATE_SEEN_KEY = "heat_island_optimizer_android_seen_update_version";

    const optimizer = window.HIO_OPTIMIZER;
    const catalog = window.HIO_CATALOG;
    const templates = window.HIO_TEMPLATES || [];

    const i18n = window.HIO_I18N || {};
    const LANGUAGES = i18n.languages || [];
    const I18N = i18n.messages || { ru: {}, en: {} };
    const CHANGELOG = i18n.changelog || { ru: [], en: [] };

    let rows = 20;
    let cols = 20;
    let buildable = [];
    let obstacles = [];
    let buildings = [];
    let activeTool = "obstacle";
    let drawingTool = "toggleTerrain";
    let currentSection = "map";
    let isDrawing = false;
    let terrainDrawValue = null;
    let obstacleDrawValue = null;
    let lastPainted = null;
    let lastTap = { time: 0, r: -1, c: -1 };
    let undoSnapshot = null;
    let zoom = DEFAULT_ZOOM;
    let rememberedLevelsByType = readLevelMemory();
    let lastResult = null;
    let backgroundState = null;
    let pendingBetterResult = null;
    let autoPlacementInfo = null;
    let appLanguage = localStorage.getItem(LANGUAGE_KEY) || "ru";
    let previousSectionBeforeChangelog = "map";
    let dropdownClickBlockUntil = 0;
    let dropdownTapShieldTimer = null;

    const els = {};
    const typeControls = {};
    const choiceControls = {};

    document.addEventListener("DOMContentLoaded", init);

    function init() {
        cacheElements();
        setStaticVersion();
        initGrid();
        initEquipmentControls();
        renderTemplates();
        refreshSavedLayouts();
        bindEvents();
        updateDateTime();
        setInterval(updateDateTime, 1000);
        applyLanguage(appLanguage);
        renderChangelog();
        loadLastStateOrTemplate();
        switchSection("map");
        setTool("toggleTerrain");
        switchSection("map");
        calculateCurrent(false);
        setTimeout(showStartupFlow, 200);
    }

    function cacheElements() {
        const byId = (id) => document.getElementById(id);
        for (const id of [
            "versionBadge", "settingsVersion", "currentDateTime", "templateSelect", "templateChoiceButton", "templateChoiceText", "templateChoiceMenu", "loadTemplateBtn",
            "rowsInput", "colsInput", "resizeBtn", "undoFillBtn", "sourceType", "sourceTypeClear", "sourceTypeToggle", "sourceTypeMenu",
            "sourceLevel", "sourceLevelChoiceButton", "sourceLevelChoiceText", "sourceLevelChoiceMenu", "generatorType", "generatorTypeClear", "generatorTypeToggle", "generatorTypeMenu", "generatorLevel", "generatorLevelChoiceButton", "generatorLevelChoiceText", "generatorLevelChoiceMenu",
            "radiatorType", "radiatorTypeClear", "radiatorTypeToggle", "radiatorTypeMenu", "radiatorLevel", "radiatorLevelChoiceButton", "radiatorLevelChoiceText", "radiatorLevelChoiceMenu",
            "allowObstaclesInput", "equipmentInfo", "autoBtn", "mapAnalyzeBtn", "mapClearBuildingsBtn",
            "saveNameInput", "saveBrowserBtn", "downloadJsonBtn", "savedLayoutsSelect", "savedLayoutsChoiceButton", "savedLayoutsChoiceText", "savedLayoutsChoiceMenu", "loadBrowserBtn", "deleteSaveBtn",
            "chooseFileBtn", "exportBtn", "importBtn", "jsonFileInput", "jsonBox", "autoLog", "grid", "gridShell", "mapGridHost", "drawingGridHost",
            "summary", "warnings", "generatorsTable", "sourcesTable", "radiatorsTable", "menuFab", "menuBackdrop", "menuSheet",
            "modalBackdrop", "modal", "modalCloseBtn", "modalTitle", "modalBody", "modalActions", "backgroundStatus",
            "zoomOutBtn", "zoomResetBtn", "zoomInBtn", "openChangelogBtn", "openLanguageBtn", "changelogFull",
        ]) {
            els[id] = byId(id);
        }
        typeControls.source = { input: els.sourceType, clear: els.sourceTypeClear, toggle: els.sourceTypeToggle, menu: els.sourceTypeMenu };
        typeControls.generator = { input: els.generatorType, clear: els.generatorTypeClear, toggle: els.generatorTypeToggle, menu: els.generatorTypeMenu };
        typeControls.radiator = { input: els.radiatorType, clear: els.radiatorTypeClear, toggle: els.radiatorTypeToggle, menu: els.radiatorTypeMenu };
    }

    function bindEvents() {
        document.addEventListener("click", blockSyntheticDropdownClick, true);
        document.addEventListener("pointerdown", blockSyntheticDropdownPointer, true);
        document.addEventListener("mousedown", blockSyntheticDropdownPointer, true);
        document.addEventListener("touchstart", blockSyntheticDropdownPointer, true);
        document.addEventListener("focusin", blockDropdownFocus, true);
        document.querySelectorAll(".tool").forEach((button) => button.addEventListener("click", () => setTool(button.dataset.tool)));
        els.resizeBtn.addEventListener("click", resizeGrid);
        els.undoFillBtn.addEventListener("click", undoLastFill);
        els.loadTemplateBtn.addEventListener("click", loadSelectedTemplate);
        els.mapAnalyzeBtn.addEventListener("click", () => calculateCurrent(true));
        els.mapClearBuildingsBtn.addEventListener("click", clearBuildings);
        els.autoBtn.addEventListener("click", confirmAndAutoPlace);
        document.getElementById("clearBuildingsBtn")?.addEventListener("click", clearBuildings);
        document.getElementById("clearObstaclesBtn")?.addEventListener("click", clearObstacles);
        document.getElementById("fillIslandBtn")?.addEventListener("click", fillIsland);
        document.getElementById("clearIslandBtn")?.addEventListener("click", clearIsland);
        els.saveBrowserBtn.addEventListener("click", saveToDevice);
        els.downloadJsonBtn.addEventListener("click", downloadJsonFile);
        els.loadBrowserBtn.addEventListener("click", loadFromDevice);
        els.deleteSaveBtn.addEventListener("click", deleteDeviceSave);
        els.chooseFileBtn.addEventListener("click", () => els.jsonFileInput.click());
        els.jsonFileInput.addEventListener("change", () => {
            const file = els.jsonFileInput.files && els.jsonFileInput.files[0];
            if (file) loadJsonFile(file);
            els.jsonFileInput.value = "";
        });
        els.exportBtn.addEventListener("click", exportJson);
        els.importBtn.addEventListener("click", importJson);
        els.menuFab.addEventListener("click", toggleMenu);
        els.menuBackdrop.addEventListener("click", closeMenu);
        els.menuSheet.querySelectorAll("button[data-section]").forEach((button) => button.addEventListener("click", () => {
            switchSection(button.dataset.section);
            closeMenu();
        }));
        els.zoomInBtn.addEventListener("click", () => setZoom(zoom + 0.15));
        els.zoomOutBtn.addEventListener("click", () => setZoom(zoom - 0.15));
        els.zoomResetBtn.addEventListener("click", () => setZoom(DEFAULT_ZOOM));
        els.openChangelogBtn.addEventListener("click", () => openChangelogSection());
        els.versionBadge.addEventListener("click", toggleChangelogFromVersion);
        els.openLanguageBtn.addEventListener("click", () => showLanguageModal(false));
        els.modalCloseBtn.addEventListener("click", closeModal);
        els.modalBackdrop.addEventListener("click", closeModal);
        window.addEventListener("pointermove", onGlobalPointerMove, { passive: false });

        for (const kind of ["source", "generator", "radiator"]) setupTypeCombo(kind);
        setupChoiceSelect("template", els.templateSelect, els.templateChoiceButton, els.templateChoiceText, els.templateChoiceMenu);
        setupChoiceSelect("savedLayouts", els.savedLayoutsSelect, els.savedLayoutsChoiceButton, els.savedLayoutsChoiceText, els.savedLayoutsChoiceMenu);
        setupChoiceSelect("sourceLevel", els.sourceLevel, els.sourceLevelChoiceButton, els.sourceLevelChoiceText, els.sourceLevelChoiceMenu);
        setupChoiceSelect("generatorLevel", els.generatorLevel, els.generatorLevelChoiceButton, els.generatorLevelChoiceText, els.generatorLevelChoiceMenu);
        setupChoiceSelect("radiatorLevel", els.radiatorLevel, els.radiatorLevelChoiceButton, els.radiatorLevelChoiceText, els.radiatorLevelChoiceMenu);
        for (const [kind, select] of [["source", els.sourceLevel], ["generator", els.generatorLevel], ["radiator", els.radiatorLevel]]) {
            select.addEventListener("change", () => {
                rememberCurrentLevel(kind);
                updateEquipmentInfo();
                saveLastState();
            });
        }
        els.allowObstaclesInput.addEventListener("change", saveLastState);
    }

    function setStaticVersion() {
        els.versionBadge.textContent = `v${APP_VERSION}`;
        els.settingsVersion.textContent = APP_VERSION;
    }

    function initGrid() {
        buildable = optimizer.matrix(rows, cols, true);
        obstacles = optimizer.matrix(rows, cols, false);
        buildings = optimizer.matrix(rows, cols, null);
        renderGrid();
    }

    function renderGrid() {
        els.grid.style.gridTemplateColumns = `repeat(${cols}, var(--cell-size))`;
        els.grid.innerHTML = "";
        for (let r = 0; r < rows; r += 1) {
            for (let c = 0; c < cols; c += 1) {
                const cell = document.createElement("div");
                cell.className = cellClass(r, c);
                cell.textContent = cellLabel(r, c);
                cell.dataset.r = String(r);
                cell.dataset.c = String(c);
                cell.addEventListener("pointerdown", onCellPointerDown);
                cell.addEventListener("pointerenter", onCellPointerEnter);
                cell.addEventListener("pointerup", endDrawing);
                els.grid.appendChild(cell);
            }
        }
        updateCellSize();
    }

    function cellClass(r, c) {
        if (!buildable[r][c]) return "cell blocked";
        if (buildings[r][c] === SOURCE) return "cell source";
        if (buildings[r][c] === GENERATOR) return "cell generator";
        if (buildings[r][c] === RADIATOR) return "cell radiator";
        if (obstacles[r][c]) return "cell obstacle";
        return "cell available";
    }

    function cellLabel(r, c) {
        const lang = normalizeLanguageCode(appLanguage);
        if (buildings[r][c] === SOURCE) return lang === "en" ? "S" : "И";
        if (buildings[r][c] === GENERATOR) return lang === "en" ? "G" : "Г";
        if (buildings[r][c] === RADIATOR) return lang === "en" ? "H" : "Р";
        if (obstacles[r][c]) return "♣";
        return "";
    }

    function onCellPointerDown(event) {
        event.preventDefault();
        const r = parseInt(event.currentTarget.dataset.r, 10);
        const c = parseInt(event.currentTarget.dataset.c, 10);
        const now = Date.now();
        const isDouble = now - lastTap.time < 330 && lastTap.r === r && lastTap.c === c;
        const tool = getPaintTool();
        if (currentSection === "drawing" && isDouble && (tool === "toggleTerrain" || tool === "obstacle")) {
            if (lastTap.snapshot) {
                buildable = cloneMatrix(lastTap.snapshot.buildable);
                obstacles = cloneMatrix(lastTap.snapshot.obstacles);
                buildings = cloneMatrix(lastTap.snapshot.buildings);
            }
            lastTap = { time: 0, r: -1, c: -1, snapshot: null };
            fillArea(r, c, tool);
            return;
        }
        const beforePaint = { buildable: cloneMatrix(buildable), obstacles: cloneMatrix(obstacles), buildings: cloneMatrix(buildings) };
        lastTap = { time: now, r, c, snapshot: beforePaint };
        isDrawing = true;
        lastPainted = null;
        terrainDrawValue = null;
        obstacleDrawValue = null;
        paintCell(r, c);
        updateOneCell(r, c);
        saveLastStateThrottled();
    }

    function onCellPointerEnter(event) {
        if (!isDrawing || event.pointerType === "touch") return;
        const r = parseInt(event.currentTarget.dataset.r, 10);
        const c = parseInt(event.currentTarget.dataset.c, 10);
        paintCell(r, c);
        updateOneCell(r, c);
        saveLastStateThrottled();
    }

    function onGlobalPointerMove(event) {
        if (!isDrawing || event.pointerType !== "touch") return;
        event.preventDefault();
        const node = document.elementFromPoint(event.clientX, event.clientY);
        const cell = node && node.closest ? node.closest(".cell") : null;
        if (!cell || !els.grid.contains(cell)) return;
        const r = parseInt(cell.dataset.r, 10);
        const c = parseInt(cell.dataset.c, 10);
        paintCell(r, c);
        updateOneCell(r, c);
        saveLastStateThrottled();
    }

    function endDrawing() {
        isDrawing = false;
        terrainDrawValue = null;
        obstacleDrawValue = null;
        lastPainted = null;
    }

    window.addEventListener("pointerup", endDrawing);

    function paintCell(r, c) {
        const tool = getPaintTool();
        const k = `${r},${c}`;
        if (lastPainted === k) return;
        lastPainted = k;
        if (tool === "toggleTerrain") {
            if (terrainDrawValue === null) terrainDrawValue = !buildable[r][c];
            const beforeBuilding = buildings[r][c];
            buildable[r][c] = terrainDrawValue;
            if (!buildable[r][c]) { obstacles[r][c] = false; buildings[r][c] = null; }
            if (beforeBuilding !== buildings[r][c]) markManualBuildingChange();
            return;
        }
        if (tool === "obstacle") {
            buildable[r][c] = true;
            if (obstacleDrawValue === null) obstacleDrawValue = !obstacles[r][c];
            const beforeBuilding = buildings[r][c];
            obstacles[r][c] = obstacleDrawValue;
            if (obstacles[r][c]) buildings[r][c] = null;
            if (beforeBuilding !== buildings[r][c]) markManualBuildingChange();
            return;
        }
        if (!buildable[r][c]) return;
        if (tool === "erase") {
            if (buildings[r][c] !== null) markManualBuildingChange();
            buildings[r][c] = null;
            return;
        }
        if ([SOURCE, GENERATOR, RADIATOR].includes(tool)) {
            if (buildings[r][c] !== tool) markManualBuildingChange();
            buildings[r][c] = tool;
            obstacles[r][c] = false;
        }
    }

    function updateOneCell(r, c) {
        const index = r * cols + c;
        const cell = els.grid.children[index];
        if (!cell) return;
        cell.className = cellClass(r, c);
        cell.textContent = cellLabel(r, c);
    }

    function fillArea(r, c, tool = getPaintTool()) {
        const buildingsBeforeFill = cloneMatrix(buildings);
        undoSnapshot = { buildable: cloneMatrix(buildable), obstacles: cloneMatrix(obstacles), buildings: cloneMatrix(buildings) };
        const targetBuildable = buildable[r][c];
        const targetObstacle = obstacles[r][c];
        const targetBuilding = buildings[r][c];
        const queue = [[r, c]];
        const seen = new Set([`${r},${c}`]);
        const fillTerrain = tool === "toggleTerrain";
        const newBuildable = fillTerrain ? !targetBuildable : true;
        const newObstacle = tool === "obstacle" ? !targetObstacle : false;
        for (let i = 0; i < queue.length; i += 1) {
            const [cr, cc] = queue[i];
            if (fillTerrain) {
                buildable[cr][cc] = newBuildable;
                if (!newBuildable) { obstacles[cr][cc] = false; buildings[cr][cc] = null; }
            } else {
                buildable[cr][cc] = true;
                obstacles[cr][cc] = newObstacle;
                if (newObstacle) buildings[cr][cc] = null;
            }
            for (const [nr, nc] of [[cr - 1, cc], [cr + 1, cc], [cr, cc - 1], [cr, cc + 1]]) {
                if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
                const nk = `${nr},${nc}`;
                if (seen.has(nk)) continue;
                if (buildable[nr][nc] === targetBuildable && obstacles[nr][nc] === targetObstacle && buildings[nr][nc] === targetBuilding) {
                    seen.add(nk);
                    queue.push([nr, nc]);
                }
            }
        }
        if (hasBuildingMatrixChanged(buildingsBeforeFill, buildings)) markManualBuildingChange();
        renderGrid();
        saveLastState();
        showToast(t("filledCells", { count: queue.length }));
    }

    function undoLastFill() {
        if (!undoSnapshot) { showToast(t("nothingToUndo")); return; }
        buildable = cloneMatrix(undoSnapshot.buildable);
        obstacles = cloneMatrix(undoSnapshot.obstacles);
        buildings = cloneMatrix(undoSnapshot.buildings);
        undoSnapshot = null;
        renderGrid();
        saveLastState();
        showToast(t("fillUndone"));
    }

    function setTool(tool) {
        drawingTool = tool;
        activeTool = tool;
        updateToolButtons();
    }

    function updateToolButtons() {
        document.querySelectorAll(".tool").forEach((button) => button.classList.toggle("active", button.dataset.tool === drawingTool));
    }

    function getPaintTool() {
        return currentSection === "map" ? "obstacle" : drawingTool;
    }

    function switchSection(section) {
        if (section !== "changelog") previousSectionBeforeChangelog = section;
        currentSection = section;
        document.querySelectorAll(".app-section").forEach((node) => node.classList.remove("active"));
        document.getElementById(`section${capitalize(section)}`)?.classList.add("active");
        els.menuSheet.querySelectorAll("button[data-section]").forEach((button) => button.classList.toggle("active", button.dataset.section === section));
        if (section === "map") {
            activeTool = "obstacle";
            moveGrid(els.mapGridHost);
        }
        if (section === "drawing") {
            activeTool = drawingTool;
            updateToolButtons();
            moveGrid(els.drawingGridHost);
        }
        if (section !== "changelog") localStorage.setItem("heat_island_optimizer_android_last_section", section);
    }

    function openChangelogSection() {
        if (currentSection !== "changelog") previousSectionBeforeChangelog = currentSection || "map";
        switchSection("changelog");
    }

    function toggleChangelogFromVersion() {
        if (currentSection === "changelog") {
            switchSection(previousSectionBeforeChangelog || "map");
            return;
        }
        previousSectionBeforeChangelog = currentSection || "map";
        switchSection("changelog");
    }

    function moveGrid(host) {
        if (host && els.gridShell.parentElement !== host) host.appendChild(els.gridShell);
    }

    function toggleMenu() {
        const hidden = els.menuSheet.hidden;
        els.menuSheet.hidden = !hidden;
        els.menuBackdrop.hidden = !hidden;
    }

    function closeMenu() {
        els.menuSheet.hidden = true;
        els.menuBackdrop.hidden = true;
    }

    function resizeGrid() {
        const nextRows = clamp(parseInt(els.rowsInput.value, 10) || rows, 1, 50);
        const nextCols = clamp(parseInt(els.colsInput.value, 10) || cols, 1, 50);
        const oldBuildable = buildable;
        const oldObstacles = obstacles;
        const oldBuildings = buildings;
        rows = nextRows;
        cols = nextCols;
        buildable = optimizer.matrix(rows, cols, true);
        obstacles = optimizer.matrix(rows, cols, false);
        buildings = optimizer.matrix(rows, cols, null);
        for (let r = 0; r < Math.min(rows, oldBuildable.length); r += 1) {
            for (let c = 0; c < Math.min(cols, oldBuildable[r].length); c += 1) {
                buildable[r][c] = oldBuildable[r][c];
                obstacles[r][c] = oldObstacles[r][c];
                buildings[r][c] = oldBuildings[r][c];
            }
        }
        els.rowsInput.value = rows;
        els.colsInput.value = cols;
        renderGrid();
        saveLastState();
    }

    function setZoom(next) {
        zoom = clamp(next, 0.5, 2.1);
        updateCellSize();
    }

    function updateCellSize() {
        const base = Math.max(22, Math.min(34, Math.floor((window.innerWidth - 42) / Math.min(cols || 20, 20))));
        document.documentElement.style.setProperty("--cell-size", `${Math.round(base * zoom)}px`);
        els.zoomResetBtn.textContent = `${Math.round(zoom * 100)}%`;
    }

    window.addEventListener("resize", updateCellSize);

    function renderTemplates() {
        els.templateSelect.innerHTML = "";
        templates.forEach((template, index) => {
            const option = document.createElement("option");
            option.value = String(index);
            option.textContent = template.name || t("templateDefault", { number: index + 1 });
            els.templateSelect.appendChild(option);
        });
        refreshChoiceSelect("template");
    }

    function loadSelectedTemplate() {
        const index = parseInt(els.templateSelect.value, 10);
        if (!Number.isFinite(index) || !templates[index]) { warn(t("templateNotSelected")); return; }
        const data = JSON.parse(JSON.stringify(templates[index]));
        data.name = `${data.name || t("templateDefault", { number: index + 1 })} ${t("templateCopySuffix")}`;
        data.saved_at = new Date().toISOString();
        applyStateFromData(data);
        els.saveNameInput.value = data.name;
        switchSection("map");
        calculateCurrent(true);
        saveLastState();
    }

    function initEquipmentControls() {
        els.sourceType.value = catalogDisplayName("source", catalog.defaults.source_type);
        els.generatorType.value = catalogDisplayName("generator", catalog.defaults.generator_type);
        els.radiatorType.value = catalogDisplayName("radiator", catalog.defaults.radiator_type);
        updateLevelSelect("source", catalog.defaults.source_level);
        updateLevelSelect("generator", catalog.defaults.generator_level);
        updateLevelSelect("radiator", catalog.defaults.radiator_level);
        for (const kind of ["source", "generator", "radiator"]) {
            renderTypeMenu(kind, true);
            updateComboButtons(kind);
            rememberCurrentLevel(kind);
        }
        updateEquipmentInfo();
    }

    function isDropdownBlockActive() {
        return dropdownClickBlockUntil && Date.now() <= dropdownClickBlockUntil;
    }

    function consumeDropdownEvent(event) {
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
    }

    function blockSyntheticDropdownClick(event) {
        if (!isDropdownBlockActive()) return;
        consumeDropdownEvent(event);
    }

    function blockSyntheticDropdownPointer(event) {
        if (!isDropdownBlockActive()) return;
        consumeDropdownEvent(event);
    }

    function blockDropdownFocus(event) {
        if (!isDropdownBlockActive()) return;
        const target = event.target;
        if (!target || typeof target.blur !== "function") return;
        event.preventDefault();
        setTimeout(() => target.blur(), 0);
    }

    function getDropdownTapShield() {
        let shield = document.getElementById("dropdownTapShield");
        if (shield) return shield;

        shield = document.createElement("div");
        shield.id = "dropdownTapShield";
        shield.setAttribute("aria-hidden", "true");
        shield.style.cssText = [
            "position:fixed",
            "inset:0",
            "z-index:2147483647",
            "background:transparent",
            "display:none",
            "pointer-events:auto",
            "touch-action:none",
        ].join(";");

        const stop = (event) => consumeDropdownEvent(event);
        ["pointerdown", "pointerup", "mousedown", "mouseup", "touchstart", "touchend", "click"].forEach((name) => {
            shield.addEventListener(name, stop, true);
            shield.addEventListener(name, stop, false);
        });

        document.body.appendChild(shield);
        return shield;
    }

    function showDropdownTapShield(ms) {
        const shield = getDropdownTapShield();
        shield.style.display = "block";
        clearTimeout(dropdownTapShieldTimer);
        dropdownTapShieldTimer = setTimeout(() => {
            shield.style.display = "none";
        }, ms);
    }

    function blockNextDropdownClick(ms = 250) {
        dropdownClickBlockUntil = Date.now() + ms;
        showDropdownTapShield(ms);
        setTimeout(() => {
            if (Date.now() >= dropdownClickBlockUntil) dropdownClickBlockUntil = 0;
        }, ms + 50);
    }

    function bindTapSelect(node, handler) {
        let startX = 0;
        let startY = 0;
        let activePointerId = null;
        let moved = false;
        let suppressClick = false;
        const MOVE_LIMIT = 10;

        node.addEventListener("pointerdown", (event) => {
            if (event.pointerType === "mouse" && event.button !== 0) return;
            activePointerId = event.pointerId;
            startX = event.clientX;
            startY = event.clientY;
            moved = false;
        });

        node.addEventListener("pointermove", (event) => {
            if (activePointerId === null || event.pointerId !== activePointerId) return;
            const dx = event.clientX - startX;
            const dy = event.clientY - startY;
            if (Math.hypot(dx, dy) > MOVE_LIMIT) moved = true;
        });

        node.addEventListener("pointercancel", () => {
            activePointerId = null;
            moved = true;
        });

        node.addEventListener("pointerup", (event) => {
            if (activePointerId === null || event.pointerId !== activePointerId) return;
            const shouldSelect = !moved;
            activePointerId = null;
            if (!shouldSelect) {
                suppressClick = true;
                setTimeout(() => { suppressClick = false; }, 250);
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            suppressClick = true;
            blockNextDropdownClick();
            handler(event);
            setTimeout(() => { suppressClick = false; }, 0);
        });

        node.addEventListener("click", (event) => {
            if (suppressClick) {
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            blockNextDropdownClick();
            handler(event);
        });
    }

    function setupChoiceSelect(name, select, button, textNode, menu) {
        if (!select || !button || !textNode || !menu) return;
        choiceControls[name] = { select, button, textNode, menu };
        button.addEventListener("click", (event) => {
            event.preventDefault();
            closeAllChoiceMenus(name);
            closeAllTypeMenus();
            renderChoiceMenu(name);
            menu.hidden = !menu.hidden;
            button.blur();
        });
        document.addEventListener("click", (event) => {
            if (!button.closest(".choice-select").contains(event.target)) menu.hidden = true;
        });
        select.addEventListener("change", () => {
            syncChoiceDisplay(name);
            renderChoiceMenu(name);
        });
        syncChoiceDisplay(name);
        renderChoiceMenu(name);
    }

    function refreshChoiceSelect(name) {
        const control = choiceControls[name];
        if (!control) return;
        syncChoiceDisplay(name);
        renderChoiceMenu(name);
    }

    function syncChoiceDisplay(name) {
        const control = choiceControls[name];
        if (!control) return;
        const option = control.select.options[control.select.selectedIndex];
        control.textNode.textContent = option ? option.textContent : "—";
    }

    function renderChoiceMenu(name) {
        const control = choiceControls[name];
        if (!control) return;
        control.menu.innerHTML = "";
        const value = control.select.value;
        for (const option of Array.from(control.select.options)) {
            const item = document.createElement("div");
            item.className = `choice-item${option.value === value ? " active" : ""}`;
            item.innerHTML = `<span>${escapeHtml(option.textContent)}</span>${option.value === value ? "<span class='choice-check'>✓</span>" : ""}`;
            bindTapSelect(item, () => applyChoiceValue(name, option.value));
            control.menu.appendChild(item);
        }
    }

    function applyChoiceValue(name, value) {
        const control = choiceControls[name];
        if (!control) return;
        control.select.value = value;
        control.menu.hidden = true;
        control.select.dispatchEvent(new Event("change", { bubbles: true }));
        control.button.blur();
        if (document.activeElement && typeof document.activeElement.blur === "function") document.activeElement.blur();
    }

    function closeAllChoiceMenus(exceptName = "") {
        Object.entries(choiceControls).forEach(([name, control]) => {
            if (name !== exceptName) control.menu.hidden = true;
        });
    }

    function closeAllTypeMenus(exceptKind = "") {
        Object.entries(typeControls).forEach(([kind, control]) => {
            if (kind !== exceptKind) control.menu.hidden = true;
        });
    }

    function setupTypeCombo(kind) {
        const control = typeControls[kind];
        const combo = control.input.closest(".combo");

        [control.clear, control.toggle].forEach((button) => {
            button.addEventListener("pointerdown", (event) => {
                event.stopPropagation();
            });
        });
        control.input.addEventListener("input", () => {
            closeAllChoiceMenus();
            renderTypeMenu(kind, false);
            control.menu.hidden = false;
            updateComboButtons(kind);
        });
        control.input.addEventListener("focus", () => {
            closeAllChoiceMenus();
            renderTypeMenu(kind, false);
            control.menu.hidden = false;
        });
        control.toggle.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            closeAllChoiceMenus();
            renderTypeMenu(kind, true);
            control.menu.hidden = !control.menu.hidden;
            closeComboKeyboard(control);
        });
        control.clear.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            control.input.value = "";
            closeAllChoiceMenus();
            renderTypeMenu(kind, true);
            control.menu.hidden = false;
            updateComboButtons(kind);
            closeComboKeyboard(control);
        });
        document.addEventListener("click", (event) => {
            if (!combo.contains(event.target)) control.menu.hidden = true;
        });
    }

    function renderTypeMenu(kind, showAll) {
        const control = typeControls[kind];
        const items = getItems(kind);
        const q = control.input.value.trim().toLowerCase();
        const filtered = showAll || !q ? items : items.filter((item) => catalogSearchText(item).includes(q));
        const activeItem = findCatalogItem(kind, control.input.value);
        control.menu.innerHTML = "";
        for (const item of filtered) {
            const button = document.createElement("div");
            const isActive = activeItem && catalogKey(activeItem) === catalogKey(item);
            button.className = `combo-item${isActive ? " active" : ""}`;
            const first = item.levels[0];
            const last = item.levels[item.levels.length - 1];
            button.innerHTML = `
                <div class="combo-item-main">
                    <div class="combo-title">${escapeHtml(catalogItemName(item))}</div>
                    <div class="combo-subtitle">${escapeHtml(t("levelsRange", { first: first.level, last: last.level }))} · ${first.display} → ${last.display}</div>
                </div>
                ${isActive ? "<span class='combo-check'>✓</span>" : ""}
            `;
            bindTapSelect(button, () => selectType(kind, item));
            control.menu.appendChild(button);
        }
        if (!filtered.length) control.menu.innerHTML = `<div class="combo-item"><div class="combo-subtitle">${escapeHtml(t("nothingFound"))}</div></div>`;
    }

    function selectType(kind, itemOrName) {
        const control = typeControls[kind];
        const item = typeof itemOrName === "object" ? itemOrName : findCatalogItem(kind, itemOrName);
        if (!item) return;
        control.input.value = catalogItemName(item);
        control.menu.hidden = true;
        const memoryKey = catalogKey(item);
        const remembered = rememberedLevelsByType[kind] && rememberedLevelsByType[kind][memoryKey];
        updateLevelSelect(kind, remembered || 1);
        rememberCurrentLevel(kind);
        updateComboButtons(kind);
        updateEquipmentInfo();
        saveLastState();
        closeComboKeyboard(control);
    }

    function closeComboKeyboard(control) {
        setTimeout(() => {
            control.input.blur();
            if (document.activeElement && typeof document.activeElement.blur === "function") {
                document.activeElement.blur();
            }
            const selection = window.getSelection && window.getSelection();
            if (selection && selection.removeAllRanges) selection.removeAllRanges();
        }, 0);
    }

    function updateLevelSelect(kind, selectedLevel) {
        const select = getLevelSelect(kind);
        const item = getSelectedItem(kind);
        select.innerHTML = "";
        for (const level of item.levels) {
            const option = document.createElement("option");
            option.value = String(level.level);
            option.textContent = `${levelLabel(level.level)} · ${level.display}`;
            select.appendChild(option);
        }
        const safe = item.levels.some((row) => row.level === selectedLevel) ? selectedLevel : 1;
        select.value = String(safe);
        refreshChoiceSelect(`${kind}Level`);
    }

    function updateComboButtons(kind) {
        const control = typeControls[kind];
        control.clear.style.visibility = control.input.value ? "visible" : "hidden";
    }

    function rememberCurrentLevel(kind) {
        const item = getSelectedItem(kind);
        if (!item) return;
        if (!rememberedLevelsByType[kind]) rememberedLevelsByType[kind] = {};
        rememberedLevelsByType[kind][catalogKey(item)] = parseInt(getLevelSelect(kind).value, 10) || 1;
        localStorage.setItem(LEVEL_MEMORY_KEY, JSON.stringify(rememberedLevelsByType));
    }

    function readLevelMemory() {
        try { return JSON.parse(localStorage.getItem(LEVEL_MEMORY_KEY) || "{}"); } catch { return {}; }
    }

    function getItems(kind) {
        if (kind === "source") return catalog.sources;
        if (kind === "generator") return catalog.generators;
        return catalog.radiators;
    }

    function getTypeInput(kind) {
        return typeControls[kind].input;
    }

    function getLevelSelect(kind) {
        if (kind === "source") return els.sourceLevel;
        if (kind === "generator") return els.generatorLevel;
        return els.radiatorLevel;
    }

    function catalogKey(item) {
        return item ? (item.id || item.name || "") : "";
    }

    function catalogItemName(item, code = appLanguage) {
        if (!item) return "—";
        const lang = normalizeLanguageCode(code);
        const names = item.names || {};
        return names[lang] || names[lang.split("-")[0]] || names.en || item.name || item.id || "—";
    }

    function levelLabel(level) {
        return `${t("levelWord")} ${level}`;
    }

    function levelInline(level) {
        return `${t("levelLower")} ${level}`;
    }

    function itemLevelText(kind, typeValue, levelValue, displayValue) {
        const name = catalogDisplayName(kind, typeValue);
        const display = String(displayValue ?? "").trim();
        const parts = [name, levelInline(levelValue)];
        if (display && display !== "—" && display !== "-") parts.push(display);
        return parts.filter(Boolean).join(" · ");
    }

    function layoutChainText(params, directMode) {
        const parts = [
            itemLevelText("source", params.source_type || "", params.source_level || "—", params.source_display),
            directMode ? "" : itemLevelText("generator", params.generator_type || "", params.generator_level || "—", params.generator_display),
            itemLevelText("radiator", params.radiator_type || "", params.radiator_level || "—", params.radiator_display),
        ];
        return parts.filter(Boolean).join(" · ");
    }

    function catalogSearchText(item) {
        const names = Object.values(item.names || {});
        return [item.id, item.name, ...names].filter(Boolean).join(" ").toLowerCase();
    }

    function findCatalogItem(kind, value) {
        const needle = String(value || "").trim().toLowerCase();
        const items = getItems(kind);
        return items.find((item) => {
            const names = Object.values(item.names || {});
            return [item.id, item.name, ...names]
                .filter(Boolean)
                .some((candidate) => String(candidate).trim().toLowerCase() === needle);
        }) || items[0];
    }

    function catalogDisplayName(kind, value) {
        return catalogItemName(findCatalogItem(kind, value));
    }

    function catalogParamValue(kind, value) {
        const item = findCatalogItem(kind, value);
        return item ? (item.id || item.name) : String(value || "");
    }

    function getSelectedItem(kind) {
        return findCatalogItem(kind, getTypeInput(kind).value);
    }

    function getParams() {
        return {
            source_type: catalogParamValue("source", els.sourceType.value),
            source_level: parseInt(els.sourceLevel.value, 10) || 1,
            generator_type: catalogParamValue("generator", els.generatorType.value),
            generator_level: parseInt(els.generatorLevel.value, 10) || 1,
            radiator_type: catalogParamValue("radiator", els.radiatorType.value),
            radiator_level: parseInt(els.radiatorLevel.value, 10) || 1,
        };
    }

    function updateEquipmentInfo() {
        const params = optimizer.resolveParams(getParams());
        const sourceText = `${t("toolSource")}: ${itemLevelText("source", params.source_type, params.source_level, params.source_display)}.`;
        const radiatorText = `${t("toolRadiator")}: ${itemLevelText("radiator", params.radiator_type, params.radiator_level, params.radiator_display)}.`;
        const generatorText = `${t("toolGenerator")}: ${itemLevelText("generator", params.generator_type, params.generator_level, params.generator_display)}.`;
        const windText = t("windNote");
        els.equipmentInfo.textContent = params.source_is_direct
            ? `${sourceText} ${radiatorText} ${windText}`
            : `${sourceText} ${generatorText} ${radiatorText}`;
    }

    function getPayload() {
        return { rows, cols, buildable, obstacles, buildings, allow_obstacles: els.allowObstaclesInput.checked, params: getParams() };
    }

    function calculateCurrent(show) {
        try {
            const result = optimizer.evaluate(getPayload());
            lastResult = result;
            renderResult(result);
            if (show) switchSection("map");
        } catch (error) { warn(t("calculationError", { message: error.message })); }
    }

    function confirmAndAutoPlace() {
        switchSection("map");
        openModal({
            title: t("islandConfirmTitle"),
            body: `<p>${escapeHtml(t("islandConfirm"))}</p>`,
            actions: [
                { text: t("cancel"), close: true },
                { text: t("continue"), primary: true, onClick: () => { closeModal(); startAutoPlace(); } },
            ],
        });
    }

    function startAutoPlace() {
        const attempts = FAST_ATTEMPTS_DEFAULT;
        const runId = makeAutoSearchRunId();
        const fastSeed = makeAutoSearchSeed(runId, 0);
        showBackground(t("quickCalculating", { attempts }));
        setTimeout(() => {
            const t0 = performance.now();
            let result;
            try { result = optimizer.autoPlace({ ...getPayload(), attempts, seed: fastSeed }); }
            catch (error) { warn(t("autoPlaceError", { message: error.message })); hideBackground(); return; }
            const elapsed = performance.now() - t0;
            tagSearchInfo(result, {
                run_id: runId,
                status: "running",
                quick_attempts: attempts,
                background_done: 0,
                background_total: BACKGROUND_ATTEMPTS,
                total_checked: attempts,
                best_source: "fast",
                best_attempt_global: result.best_attempt || 0,
                best_seed: fastSeed,
                last_seed: fastSeed,
            });
            applyAutoResult(result);
            renderResult(result);
            showBackground(buildBackgroundText(result, elapsed, attempts));
            startBackgroundSearch(result, elapsed / Math.max(1, attempts), runId);
        }, 60);
    }

    function startBackgroundSearch(baseResult, msPerAttempt, runId) {
        backgroundState = {
            runId,
            done: 0,
            best: baseResult,
            bestScore: resultScore(baseResult),
            started: performance.now(),
            msPerAttempt,
            appliedSnapshot: cloneMatrix(baseResult.buildings || buildings),
            improvements: 0,
        };
        runBackgroundChunk();
    }

    function runBackgroundChunk() {
        if (!backgroundState) return;
        if (backgroundState.done >= BACKGROUND_ATTEMPTS) {
            finishBackgroundSearch();
            return;
        }

        const previousDone = backgroundState.done;
        const chunk = Math.min(BACKGROUND_CHUNK, BACKGROUND_ATTEMPTS - previousDone);
        const seed = makeAutoSearchSeed(backgroundState.runId, previousDone + 1);

        setTimeout(() => {
            if (!backgroundState) return;

            let result;
            try { result = optimizer.autoPlace({ ...getPayload(), attempts: chunk, seed }); }
            catch (error) { warn(t("backgroundError", { message: error.message })); backgroundState = null; return; }

            backgroundState.done += chunk;
            const doneNow = backgroundState.done;
            const bestAttemptGlobal = FAST_ATTEMPTS_DEFAULT + previousDone + (result.best_attempt || 0);

            tagSearchInfo(result, {
                run_id: backgroundState.runId,
                status: "running",
                quick_attempts: FAST_ATTEMPTS_DEFAULT,
                background_done: doneNow,
                background_total: BACKGROUND_ATTEMPTS,
                total_checked: FAST_ATTEMPTS_DEFAULT + doneNow,
                best_source: "background",
                best_attempt_global: bestAttemptGlobal,
                best_seed: seed,
                last_seed: seed,
            });

            let appliedBetter = false;
            if (isBetterResult(result, backgroundState.best)) {
                const previousBest = backgroundState.best;
                backgroundState.best = result;
                backgroundState.bestScore = resultScore(result);
                backgroundState.improvements += 1;
                pendingBetterResult = result;

                if (canApplyBackgroundResult()) {
                    const previousEvents = (previousBest && previousBest.search_info && Array.isArray(previousBest.search_info.background_apply_events))
                        ? previousBest.search_info.background_apply_events
                        : [];
                    const improvementEvent = buildBackgroundImprovementEvent(previousBest, result, doneNow, seed, bestAttemptGlobal, backgroundState.improvements);
                    tagSearchInfo(result, {
                        status: "running",
                        background_improved: true,
                        background_improved_at: doneNow,
                        background_improvements: backgroundState.improvements,
                        background_last_apply: improvementEvent,
                        background_apply_events: [...previousEvents, improvementEvent],
                    });
                    applyAutoResult(result);
                    renderResult(result);
                    backgroundState.appliedSnapshot = cloneMatrix(result.buildings || buildings);
                    pendingBetterResult = null;
                    appliedBetter = true;
                }
            }

            if (!appliedBetter) {
                updateCurrentSearchProgress({
                    status: "running",
                    background_done: doneNow,
                    background_total: BACKGROUND_ATTEMPTS,
                    total_checked: FAST_ATTEMPTS_DEFAULT + doneNow,
                    last_seed: seed,
                    background_improvements: backgroundState.improvements,
                });
            }

            const elapsed = performance.now() - backgroundState.started;
            const left = BACKGROUND_ATTEMPTS - doneNow;
            const avg = elapsed / Math.max(1, doneNow);
            const sourceLabel = ((lastResult && lastResult.search_info && lastResult.search_info.best_source) || "fast") === "background" ? t("backgroundShort") : t("fastShort");
            const improvementsText = backgroundState.improvements ? t("backgroundImprovementsShort", { count: backgroundState.improvements }) : "";
            showBackground(t("backgroundProgress", { done: doneNow, total: BACKGROUND_ATTEMPTS, source: sourceLabel, improvements: improvementsText, left: formatDuration(avg * left) }));

            if (doneNow >= BACKGROUND_ATTEMPTS) {
                finishBackgroundSearch();
                return;
            }
            runBackgroundChunk();
        }, 40);
    }

    function finishBackgroundSearch() {
        if (!backgroundState) return;
        updateCurrentSearchProgress({
            status: "done",
            background_done: BACKGROUND_ATTEMPTS,
            background_total: BACKGROUND_ATTEMPTS,
            total_checked: FAST_ATTEMPTS_DEFAULT + BACKGROUND_ATTEMPTS,
            background_improvements: backgroundState.improvements,
        });
        const sourceLabel = ((lastResult && lastResult.search_info && lastResult.search_info.best_source) || "fast") === "background" ? t("backgroundAnalysis") : t("fastCalculation");
        const improvements = backgroundState.improvements || 0;
        backgroundState = null;
        hideBackgroundSoon(t("backgroundFinished", { done: BACKGROUND_ATTEMPTS, total: BACKGROUND_ATTEMPTS, source: sourceLabel, count: improvements }));
    }

    function applyAutoResult(result) {
        buildings = cloneMatrix(result.buildings);
        lastResult = result;
        autoPlacementInfo = makeAutoPlacementInfo(result);
        renderGrid();
        renderAutoLog(result);
        saveLastState();
    }

    function makeAutoSearchRunId() {
        return (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
    }

    function makeAutoSearchSeed(runId, offset) {
        return (Number(runId || 0) + Math.imul((Number(offset || 0) + 1) >>> 0, 0x9E3779B9)) >>> 0;
    }

    function tagSearchInfo(result, patch) {
        if (!result) return null;
        const previous = result.search_info || {};
        const info = { ...previous, ...(patch || {}) };
        info.quick_attempts = Number(info.quick_attempts || FAST_ATTEMPTS_DEFAULT);
        info.background_total = Number(info.background_total || BACKGROUND_ATTEMPTS);
        info.background_done = clamp(Number(info.background_done || 0), 0, info.background_total);
        info.total_checked = Number(info.total_checked || (info.quick_attempts + info.background_done));
        info.best_source = info.best_source || "fast";
        info.status = info.status || "running";
        result.search_info = info;
        return result;
    }

    function canApplyBackgroundResult() {
        if (!autoPlacementInfo || !autoPlacementInfo.generated_buildings) return true;
        return !hasBuildingMatrixChanged(autoPlacementInfo.generated_buildings, buildings);
    }

    function updateCurrentSearchProgress(patch) {
        if (!lastResult) return;
        tagSearchInfo(lastResult, {
            ...(lastResult.search_info || {}),
            ...(patch || {}),
        });
        renderSearchProgress(lastResult);
    }

    function renderSearchProgress(result) {
        const node = document.getElementById("summarySearchProgress");
        if (!node || !result) return;
        node.innerHTML = buildSearchInfoHtml(result);
    }

    function buildSearchInfoHtml(result) {
        const info = result && result.search_info;
        if (!info) {
            return typeof result.attempts_done === "number"
                ? `<div>${t("attemptsDone")}: <b>${result.attempts_done}</b>, ${t("bestAttempt")}: <b>${result.best_attempt}</b></div>`
                : "";
        }

        const sourceLabel = info.best_source === "background" ? t("bestSourceBackground") : t("bestSourceFast");
        const stateLabel = info.status === "done" ? t("searchDone") : t("searchRunning");
        const improvements = Number(info.background_improvements || 0);
        const improved = improvements > 0
            ? `<div>${t("backgroundImproved", { count: `<b>${improvements}</b>`, at: `<b>${info.background_improved_at || info.background_done}</b>` })}</div>`
            : `<div>${t("backgroundNoImprovement")}</div>`;
        const bestAttempt = info.best_attempt_global
            ? `<div>${t("bestVariantAttempt", { source: `<b>${escapeHtml(sourceLabel)}</b>`, attempt: `<b>${info.best_attempt_global}</b>` })}</div>`
            : `<div>${t("bestVariant", { source: `<b>${escapeHtml(sourceLabel)}</b>` })}</div>`;
        const seedInfo = [
            info.best_seed ? t("bestSeed", { seed: info.best_seed }) : "",
            info.last_seed ? t("lastSeed", { seed: info.last_seed }) : "",
        ].filter(Boolean).join(" · ");
        const seedLine = seedInfo ? `<div class="hint">${escapeHtml(seedInfo)}</div>` : "";
        const improvementNotice = buildBackgroundImprovementNotice(info);

        return `
            <div>${t("quickDone", { quick: `<b>${info.quick_attempts}</b>`, done: `<b>${info.background_done}</b>`, total: `<b>${info.background_total}</b>` })}</div>
            <div>${t("totalStatus", { total: `<b>${info.total_checked}</b>`, status: `<b>${escapeHtml(stateLabel)}</b>` })}</div>
            ${bestAttempt}
            ${improved}
            ${improvementNotice}
            ${seedLine}`;
    }

    function buildBackgroundText(result, elapsedMs, attempts) {
        const info = result.search_info || {};
        const estimate = estimateTimeText(elapsedMs, attempts, BACKGROUND_ATTEMPTS);
        const sourceLabel = info.best_source === "background" ? t("backgroundShort") : t("fastShort");
        return t("quickReady", { attempts, done: info.background_done || 0, total: BACKGROUND_ATTEMPTS, source: sourceLabel, left: estimate });
    }

    function isBetterResult(a, b) {
        return compareTuple(resultScore(a), resultScore(b)) > 0;
    }

    function resultScore(result) {
        const s = result.stats || {};
        return [s.score || 0, s.accepted_heat || 0, (s.stable_generators || 0) + (s.stable_sources || 0), -(s.radiators || 0) - (s.sources || 0), -(s.over_limit_heat || 0)];
    }

    function buildBackgroundImprovementEvent(previousResult, nextResult, doneNow, seed, bestAttemptGlobal, improvementNumber) {
        const prevStats = (previousResult && previousResult.stats) || {};
        const nextStats = (nextResult && nextResult.stats) || {};
        const previousAccepted = Number(prevStats.accepted_heat || 0);
        const nextAccepted = Number(nextStats.accepted_heat || 0);
        const previousCooling = Number(prevStats.cooling_used || 0);
        const nextCooling = Number(nextStats.cooling_used || 0);
        const previousStable = Number((prevStats.stable_generators || 0) + (prevStats.stable_sources || 0));
        const nextStable = Number((nextStats.stable_generators || 0) + (nextStats.stable_sources || 0));
        return {
            time: new Date().toISOString(),
            number: Number(improvementNumber || 0),
            background_done: Number(doneNow || 0),
            best_attempt_global: Number(bestAttemptGlobal || 0),
            seed: Number(seed || 0),
            previous_accepted: previousAccepted,
            next_accepted: nextAccepted,
            accepted_delta: nextAccepted - previousAccepted,
            previous_cooling: previousCooling,
            next_cooling: nextCooling,
            cooling_delta: nextCooling - previousCooling,
            previous_stable: previousStable,
            next_stable: nextStable,
            stable_delta: nextStable - previousStable,
        };
    }

    function buildBackgroundImprovementNotice(info) {
        const event = info && info.background_last_apply;
        if (!event) return "";
        const deltaClass = Number(event.accepted_delta || 0) >= 0 ? "good" : "bad";
        const deltaText = `${Number(event.accepted_delta || 0) >= 0 ? "+" : ""}${formatNumber(event.accepted_delta || 0)}`;
        return `
            <div class="background-status" style="display:block; margin-top:10px;">
                <div><b>${escapeHtml(t("backgroundApplyNoticeTitle"))}</b></div>
                <div>${t("backgroundApplyNoticeValues", { before: `<b>${formatNumber(event.previous_accepted || 0)}</b>`, after: `<b>${formatNumber(event.next_accepted || 0)}</b>`, delta: `<b class="${deltaClass}">${deltaText}</b>` })}</div>
                <div class="hint">${t("backgroundApplyNoticeMeta", { done: event.background_done || 0, total: BACKGROUND_ATTEMPTS, attempt: event.best_attempt_global || "—" })}</div>
            </div>`;
    }

    function buildBackgroundEventsHtml(info) {
        const events = Array.isArray(info && info.background_apply_events) ? info.background_apply_events : [];
        if (!events.length) return "";
        const rows = events.map((event, index) => {
            const acceptedDelta = Number(event.accepted_delta || 0);
            const deltaText = `${acceptedDelta >= 0 ? "+" : ""}${formatNumber(acceptedDelta)}`;
            const deltaClass = acceptedDelta >= 0 ? "good" : "bad";
            return `<tr>
                <td>${index + 1}</td>
                <td>${escapeHtml(formatDateTime(event.time))}</td>
                <td>${event.background_done || 0}</td>
                <td>${event.best_attempt_global || "—"}</td>
                <td>${escapeHtml(String(event.seed || "—"))}</td>
                <td>${formatNumber(event.previous_accepted || 0)}</td>
                <td>${formatNumber(event.next_accepted || 0)}</td>
                <td class="${deltaClass}">${deltaText}</td>
            </tr>`;
        }).join("");
        return `
            <div class="background-status" style="display:block; margin:12px 0;">
                <b>${escapeHtml(t("backgroundApplyTitle", { count: events.length }))}</b>
                <div class="table-wrap">
                    <table>
                        <thead><tr><th>${escapeHtml(t("warningNumber"))}</th><th>${escapeHtml(t("time"))}</th><th>${escapeHtml(t("background"))}</th><th>${escapeHtml(t("attempt"))}</th><th>Seed</th><th>${escapeHtml(t("before"))}</th><th>${escapeHtml(t("after"))}</th><th>Δ</th></tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>`;
    }

    function renderResult(result) {
        const stats = result.stats;
        const params = result.params;
        const modeLabel = stats.direct_mode ? t("modeDirect") : t("modeNormal");
        const stableLabel = stats.direct_mode
            ? t("stableWind", { stable: stats.stable_sources, total: stats.sources })
            : t("stableGenerators", { stable: stats.stable_generators, total: stats.active_generators });
        const usedObstacles = typeof result.used_obstacles === "number" ? `<div>${t("usedObstacles", { count: `<b>${result.used_obstacles}</b>` })}</div>` : "";
        const searchInfoText = buildSearchInfoHtml(result);
        els.summary.innerHTML = `
            <div>${t("mode")}: <b>${escapeHtml(modeLabel)}</b></div>
            <div>${t("resultCells", { cells: `<b>${stats.buildable_cells}</b>`, sources: `<b>${stats.sources}</b>`, generators: `<b>${stats.generators}</b>`, radiators: `<b>${stats.radiators}</b>` })}</div>
            <div>${escapeHtml(stableLabel)}</div>
            <div>${t("resultAccepted", { accepted: `<b>${formatNumber(stats.accepted_heat)}</b>`, waste: `<b>${formatNumber(stats.waste_heat)}</b>` })}</div>
            <div>${t("resultCooling", { used: `<b>${formatNumber(stats.cooling_used)}</b>`, capacity: `<b>${formatNumber(stats.cooling_capacity)}</b>` })}</div>
            ${stats.over_limit_heat ? `<div>${t("resultOverLimit", { value: `<b>${formatNumber(stats.over_limit_heat)}</b>` })}</div>` : ""}
            ${usedObstacles}<div id="summarySearchProgress" class="search-progress">${searchInfoText}</div>
            <div class="hint">${escapeHtml(layoutChainText(params, stats.direct_mode))}</div>`;
        renderWarnings(result.warnings || []);
        renderGeneratorsTable(result.generators || {});
        renderSourcesTable(result.sources || {}, stats.direct_mode);
        renderRadiatorsTable(result.radiators || {}, stats.direct_mode);
        renderAutoLog(result);
    }

    function makeAutoPlacementInfo(result) {
        const stats = result.stats || {};
        const params = result.params || getParams();
        return {
            created_at: new Date().toISOString(),
            app_version: APP_VERSION,
            generated_buildings: cloneMatrix(result.buildings),
            attempts_done: (result.search_info && result.search_info.total_checked) || result.attempts_done || 0,
            best_attempt: (result.search_info && result.search_info.best_attempt_global) || result.best_attempt || 0,
            search_info: result.search_info || null,
            used_obstacles: result.used_obstacles || 0,
            stats: {
                sources: stats.sources || 0,
                generators: stats.generators || 0,
                radiators: stats.radiators || 0,
                active_generators: stats.active_generators || 0,
                stable_generators: stats.stable_generators || 0,
                stable_sources: stats.stable_sources || 0,
                accepted_heat: stats.accepted_heat || 0,
                waste_heat: stats.waste_heat || 0,
                cooling_used: stats.cooling_used || 0,
                cooling_capacity: stats.cooling_capacity || 0,
            },
            params: {
                source_type: params.source_type,
                source_level: params.source_level,
                generator_type: params.generator_type,
                generator_level: params.generator_level,
                radiator_type: params.radiator_type,
                radiator_level: params.radiator_level,
            },
            manual_touched_at: null,
            manual_touch_count: 0,
        };
    }

    function hasBuildingMatrixChanged(a, b) {
        const maxRows = Math.max(a ? a.length : 0, b ? b.length : 0);
        const maxCols = Math.max((a && a[0] ? a[0].length : 0), (b && b[0] ? b[0].length : 0));
        for (let r = 0; r < maxRows; r++) {
            for (let c = 0; c < maxCols; c++) {
                if (((a && a[r] && a[r][c]) || null) !== ((b && b[r] && b[r][c]) || null)) return true;
            }
        }
        return false;
    }

    function markManualBuildingChange() {
        if (!autoPlacementInfo || !autoPlacementInfo.generated_buildings) return;
        autoPlacementInfo.manual_touched_at = autoPlacementInfo.manual_touched_at || new Date().toISOString();
        autoPlacementInfo.manual_touch_count = (autoPlacementInfo.manual_touch_count || 0) + 1;
    }

    function renderAutoLog(result) {
        if (!els.autoLog) return;
        if (!autoPlacementInfo || !autoPlacementInfo.generated_buildings) {
            els.autoLog.innerHTML = `<p class='hint'>${escapeHtml(t("noAutoLog"))}</p>`;
            return;
        }
        const diff = diffAutoBuildings();
        const removedRadiators = diff.filter((row) => row.type === "removed" && row.before === RADIATOR).length;
        const removedGenerators = diff.filter((row) => row.type === "removed" && row.before === GENERATOR).length;
        const removedSources = diff.filter((row) => row.type === "removed" && row.before === SOURCE).length;
        const changed = diff.length > 0;
        const status = changed
            ? `<span class='bad'>${escapeHtml(t("autoLogChanged"))}</span>`
            : `<span class='good'>${escapeHtml(t("autoLogSame"))}</span>`;
        const stats = autoPlacementInfo.stats || {};
        const params = autoPlacementInfo.params || {};
        const diffRows = diff.slice(0, 40).map((row) => {
            const action = row.type === "removed" ? t("removed") : row.type === "added" ? t("added") : t("changed");
            const before = row.before ? buildingFullName(row.before) : "—";
            const after = row.after ? buildingFullName(row.after) : "—";
            return `<tr><td>${escapeHtml(row.coord)}</td><td>${escapeHtml(action)}</td><td>${escapeHtml(before)}</td><td>${escapeHtml(after)}</td></tr>`;
        }).join("");
        const diffTable = diffRows
            ? `<div class="table-wrap"><table><thead><tr><th>${escapeHtml(t("cell"))}</th><th>${escapeHtml(t("action"))}</th><th>${escapeHtml(t("before"))}</th><th>${escapeHtml(t("after"))}</th></tr></thead><tbody>${diffRows}</tbody></table></div>`
            : `<p class='hint'>${escapeHtml(t("noAutoDiff"))}</p>`;
        const more = diff.length > 40 ? `<p class='hint'>${escapeHtml(t("moreChanges", { count: diff.length - 40 }))}</p>` : "";
        const removedSummary = changed
            ? `<div class="warning small-warning">${t("afterAutoChanged", { count: `<b>${diff.length}</b>`, sources: `<b>${removedSources}</b>`, generators: `<b>${removedGenerators}</b>`, radiators: `<b>${removedRadiators}</b>` })}</div>`
            : "";
        const backgroundEventsHtml = buildBackgroundEventsHtml(autoPlacementInfo.search_info || {});
        const chainText = layoutChainText(params, !params.generator_type);
        els.autoLog.innerHTML = `
            <div class="auto-log-box">
                <div>${escapeHtml(t("status"))}: ${status}</div>
                <div>${escapeHtml(t("launch"))}: <b>${formatDateTime(autoPlacementInfo.created_at)}</b>. ${escapeHtml(t("version"))}: <b>${escapeHtml(autoPlacementInfo.app_version || "—")}</b>.</div>
                <div>${escapeHtml(t("attemptsDone"))}: <b>${autoPlacementInfo.attempts_done || 0}</b>, ${escapeHtml(t("bestAttempt"))}: <b>${autoPlacementInfo.best_attempt || 0}</b>.</div>
                <div>${t("autoBuildings", { sources: `<b>${stats.sources || 0}</b>`, generators: `<b>${stats.generators || 0}</b>`, radiators: `<b>${stats.radiators || 0}</b>` })}</div>
                <div>${t("autoStability", { stable: `<b>${stats.stable_generators || stats.stable_sources || 0}</b>`, total: `<b>${stats.active_generators || stats.sources || 0}</b>` })}</div>
                <div>${t("heatLine", { accepted: `<b>${formatNumber(stats.accepted_heat || 0)}</b>`, coolingUsed: `<b>${formatNumber(stats.cooling_used || 0)}</b>`, coolingCapacity: `<b>${formatNumber(stats.cooling_capacity || 0)}</b>` })}</div>
                <div class="hint">${escapeHtml(chainText)}</div>
                ${backgroundEventsHtml}
                ${removedSummary}
                ${diffTable}${more}
            </div>`;
    }

    function diffAutoBuildings() {
        const base = autoPlacementInfo && autoPlacementInfo.generated_buildings;
        if (!base) return [];
        const out = [];
        const maxRows = Math.max(base.length || 0, rows);
        const maxCols = Math.max((base[0] || []).length || 0, cols);
        for (let r = 0; r < maxRows; r++) {
            for (let c = 0; c < maxCols; c++) {
                const before = (base[r] && base[r][c]) || null;
                const after = (buildings[r] && buildings[r][c]) || null;
                if (before === after) continue;
                out.push({
                    coord: `${r + 1}:${c + 1}`,
                    before,
                    after,
                    type: before && !after ? "removed" : !before && after ? "added" : "changed",
                });
            }
        }
        return out;
    }

    function buildingFullName(code) {
        if (code === SOURCE) return t("buildingSource");
        if (code === GENERATOR) return t("buildingGenerator");
        if (code === RADIATOR) return t("buildingRadiator");
        return String(code || "—");
    }

    function formatDateTime(value) {
        try { return new Date(value).toLocaleString(appLanguage || "ru"); }
        catch { return String(value || "—"); }
    }

    function renderWarnings(warnings) {
        const list = Array.isArray(warnings) ? warnings : [];
        if (!list.length) {
            els.warnings.innerHTML = "";
            return;
        }

        const rowsHtml = list.map((warning, index) => {
            const parsed = parseWarning(warning);
            return `<tr>
                <td>${index + 1}</td>
                <td>${escapeHtml(parsed.type)}</td>
                <td>${escapeHtml(parsed.cell)}</td>
                <td class="warning-text-cell">${escapeHtml(parsed.text)}</td>
            </tr>`;
        }).join("");

        els.warnings.innerHTML = `
            <details id="warningsDetails" class="warnings-details">
                <summary>${escapeHtml(t("warningTitle", { count: list.length }))}</summary>
                <div class="warnings-table-wrap">
                    <table class="warnings-table">
                        <thead>
                            <tr><th>${escapeHtml(t("warningNumber"))}</th><th>${escapeHtml(t("warningType"))}</th><th>${escapeHtml(t("cell"))}</th><th>${escapeHtml(t("warningText"))}</th></tr>
                        </thead>
                        <tbody>${rowsHtml}</tbody>
                    </table>
                </div>
            </details>`;
    }

    function parseWarning(warning) {
        const text = translateWarning(String(warning || "").trim());
        const cellMatch = text.match(/(\d+)\s*:\s*(\d+)/);
        const cell = cellMatch ? `${cellMatch[1]}:${cellMatch[2]}` : "—";
        let type = t("warningCommon");

        if (/^Источник|^Source/i.test(text)) type = t("warningSource");
        else if (/^Генератор|^Generator/i.test(text)) type = t("warningGenerator");
        else if (/^Радиатор|^Heat Sink/i.test(text)) type = t("warningRadiator");
        else if (/^Ветротурбина|^Wind Turbine/i.test(text)) type = t("warningWind");

        return { type, cell, text };
    }

    function translateWarning(text) {
        if (normalizeLanguageCode(appLanguage) === "ru") return text;

        const splitWarning = String(text).match(/^Источник\s+(\d+:\d+)\s+связан с\s+(\d+)\s+генераторами\.\s+Тепло на каждый генератор:\s+(.+)\.$/);
        if (splitWarning) {
            return `Source at ${splitWarning[1]} affects ${splitWarning[2]} generators. Heat per generator: ${splitWarning[3]}.`;
        }

        const oldSplitWarning = String(text).match(/^Источник\s+(\d+:\d+)\s+касается\s+(\d+)\s+генераторов\s+—\s+его тепло делится по\s+(.+)\s+на каждый\.$/);
        if (oldSplitWarning) {
            return `Source at ${oldSplitWarning[1]} affects ${oldSplitWarning[2]} generators. Heat per generator: ${oldSplitWarning[3]}.`;
        }

        return text
            .replace(/Ветротурбина/g, "Wind Turbine")
            .replace(/Источник/g, "Source")
            .replace(/Генератор/g, "Generator")
            .replace(/Радиатор/g, "Heat Sink")
            .replace(/радиатора/g, "Heat Sink")
            .replace(/радиаторов/g, "Heat Sinks")
            .replace(/генераторов/g, "Generators")
            .replace(/генератора/g, "Generator")
            .replace(/ветротурбинного режима/g, "Wind Turbine mode")
            .replace(/ветротурбин/g, "Wind Turbines")
            .replace(/не касается/g, "does not touch")
            .replace(/и простаивает/g, "and is idle")
            .replace(/и ничего не отдаёт/g, "and outputs nothing")
            .replace(/не получает тепло/g, "receives no heat")
            .replace(/получает/g, "receives")
            .replace(/его тепло делится по/g, "heat per generator:")
            .replace(/на каждый/g, "per generator")
            .replace(/перегревается: не охлаждается/g, "overheats: uncooled")
            .replace(/не нужен для Wind Turbine mode/g, "is not needed in Wind Turbine mode")
            .replace(/не охлаждается/g, "uncooled");
    }

    function renderGeneratorsTable(generators) {
        const rowsHtml = Object.entries(generators).sort(sortByCoordKey).map(([cellKey, gen]) => {
            const status = gen.stable && gen.input_accepted > 0
                ? `<span class='good'>${escapeHtml(t("statusStable"))}</span>`
                : (gen.input_accepted > 0 ? `<span class='bad'>${escapeHtml(t("statusOverheat"))}</span>` : `<span class='warn'>${escapeHtml(t("statusInactive"))}</span>`);
            return `<tr><td>${coordLabel(cellKey)}</td><td>${formatNumber(gen.input_raw)}</td><td>${formatNumber(gen.input_accepted)}</td><td>${formatPercent(gen.load_percent)}</td><td>${formatNumber(gen.waste_heat)}</td><td>${formatNumber(gen.cooling_used)}</td><td>${status}</td></tr>`;
        }).join("");
        els.generatorsTable.innerHTML = makeTable([t("cell"), t("tableReceives"), t("tableAccepted"), t("tableLoad"), t("tableWaste"), t("tableCooled"), t("tableStatus")], rowsHtml);
    }

    function renderSourcesTable(sources, directMode) {
        const rowsHtml = Object.entries(sources).sort(sortByCoordKey).map(([cellKey, source]) => {
            if (source.direct) {
                const status = source.stable ? `<span class='good'>${escapeHtml(t("statusStableFemale"))}</span>` : `<span class='bad'>${escapeHtml(t("statusOverheat"))}</span>`;
                return `<tr><td>${coordLabel(cellKey)}</td><td>${formatNumber(source.direct_output)}</td><td>${formatNumber(source.waste_heat)}</td><td>${formatNumber(source.cooling_used)}</td><td>${(source.neighbor_radiators || []).map(coordLabel).join(", ") || "—"}</td><td>${status}</td></tr>`;
            }
            return `<tr><td>${coordLabel(cellKey)}</td><td>${(source.neighbor_generators || []).map(coordLabel).join(", ") || "—"}</td><td>${formatNumber(source.share_per_generator)}</td><td>${formatNumber(source.total_output)}</td></tr>`;
        }).join("");
        els.sourcesTable.innerHTML = directMode
            ? makeTable([t("cell"), t("tableOutput"), t("tableCoolingHeat"), t("tableCooled"), t("tableHeatSinks"), t("tableStatus")], rowsHtml)
            : makeTable([t("cell"), t("tableGenerators"), t("tablePerEach"), t("tableTotalOutput")], rowsHtml);
    }

    function renderRadiatorsTable(radiators, directMode) {
        const rowsHtml = Object.entries(radiators).sort(sortByCoordKey).map(([cellKey, radiator]) => {
            const status = radiator.counted
                ? (radiator.used > 0 ? `<span class='good'>${escapeHtml(t("statusWorks"))}</span>` : `<span class='warn'>${escapeHtml(t("statusIdle"))}</span>`)
                : `<span class='bad'>${escapeHtml(t("statusNotCounted"))}</span>`;
            const neighbors = directMode ? ((radiator.neighbor_sources || []).map(coordLabel).join(", ") || "—") : ((radiator.neighbor_generators || []).map(coordLabel).join(", ") || "—");
            return `<tr><td>${coordLabel(cellKey)}</td><td>${neighbors}</td><td>${formatNumber(radiator.capacity)}</td><td>${formatNumber(radiator.used)}</td><td>${status}</td></tr>`;
        }).join("");
        els.radiatorsTable.innerHTML = makeTable([t("cell"), directMode ? t("warningWind") : t("tableGenerators"), t("tableLimit"), t("tableLoadValue"), t("tableStatus")], rowsHtml);
    }

    function makeTable(headers, rowsHtml) {
        if (!rowsHtml) return `<p class='hint'>${escapeHtml(t("noObjects"))}</p>`;
        return `<div class="table-wrap"><table><thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${rowsHtml}</tbody></table></div>`;
    }

    function buildSaveData(name = "") {
        return { ...getPayload(), app_version: APP_VERSION, version: APP_VERSION_CODE, name, saved_at: new Date().toISOString(), auto_placement_info: autoPlacementInfo };
    }

    function applyStateFromData(data) {
        const normalized = optimizer.normalizePayload(data || {});
        rows = normalized.rows;
        cols = normalized.cols;
        buildable = normalized.buildable;
        obstacles = normalized.obstacles;
        buildings = normalized.buildings;
        els.rowsInput.value = rows;
        els.colsInput.value = cols;
        els.allowObstaclesInput.checked = normalized.allow_obstacles;
        if (data && data.params) setEquipmentSelections(data.params);
        if (data && data.name) els.saveNameInput.value = data.name;
        autoPlacementInfo = data && data.auto_placement_info ? data.auto_placement_info : null;
        renderGrid();
        els.warnings.innerHTML = "";
        renderAutoLog(null);
        lastResult = null;
    }

    function setEquipmentSelections(params) {
        setTypeAndLevel("source", params.source_type, params.source_level);
        setTypeAndLevel("generator", params.generator_type, params.generator_level);
        setTypeAndLevel("radiator", params.radiator_type, params.radiator_level);
        updateEquipmentInfo();
    }

    function setTypeAndLevel(kind, typeName, levelValue) {
        const input = getTypeInput(kind);
        if (typeName) input.value = catalogDisplayName(kind, typeName);
        updateLevelSelect(kind, parseInt(levelValue, 10) || 1);
        rememberCurrentLevel(kind);
        updateComboButtons(kind);
    }

    function clearBuildings() { markManualBuildingChange(); buildings = optimizer.matrix(rows, cols, null); renderGrid(); saveLastState(); calculateCurrent(false); }
    function clearObstacles() { obstacles = optimizer.matrix(rows, cols, false); renderGrid(); saveLastState(); }
    function fillIsland() { buildable = optimizer.matrix(rows, cols, true); renderGrid(); saveLastState(); }
    function clearIsland() { markManualBuildingChange(); buildable = optimizer.matrix(rows, cols, false); obstacles = optimizer.matrix(rows, cols, false); buildings = optimizer.matrix(rows, cols, null); renderGrid(); saveLastState(); }

    function exportJson() { els.jsonBox.value = JSON.stringify(buildSaveData(els.saveNameInput.value.trim()), null, 2); showToast(t("jsonShown")); }
    function importJson() { try { const data = JSON.parse(els.jsonBox.value); applyStateFromData(data); calculateCurrent(true); saveLastState(); } catch (e) { warn(t("jsonLoadError", { message: e.message })); } }

    function readSavedLayouts() { try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : {}; } catch { return {}; } }
    function writeSavedLayouts(layouts) { localStorage.setItem(STORAGE_KEY, JSON.stringify(layouts)); }

    function refreshSavedLayouts() {
        const layouts = readSavedLayouts();
        const names = Object.keys(layouts).sort((a, b) => a.localeCompare(b, appLanguage));
        els.savedLayoutsSelect.innerHTML = "";
        if (!names.length) {
            const option = document.createElement("option");
            option.value = "";
            option.textContent = t("noSaves");
            els.savedLayoutsSelect.appendChild(option);
            refreshChoiceSelect("savedLayouts");
            return;
        }
        for (const name of names) {
            const option = document.createElement("option");
            option.value = name;
            const date = layouts[name].saved_at ? new Date(layouts[name].saved_at).toLocaleString(appLanguage || "ru") : t("noDate");
            option.textContent = `${name} — ${date}`;
            els.savedLayoutsSelect.appendChild(option);
        }
        refreshChoiceSelect("savedLayouts");
    }

    function saveToDevice() {
        const fallbackName = t("islandDefaultName", { date: new Date().toLocaleString(appLanguage || "ru") });
        const name = els.saveNameInput.value.trim() || fallbackName;
        const layouts = readSavedLayouts();
        layouts[name] = buildSaveData(name);
        writeSavedLayouts(layouts);
        els.saveNameInput.value = name;
        refreshSavedLayouts();
        els.savedLayoutsSelect.value = name;
        refreshChoiceSelect("savedLayouts");
        saveLastState();
        showToast(t("saved", { name }));
    }

    function loadFromDevice() {
        const name = els.savedLayoutsSelect.value;
        const layouts = readSavedLayouts();
        if (!name || !layouts[name]) { warn(t("saveNotFound")); return; }
        applyStateFromData(layouts[name]);
        calculateCurrent(true);
        saveLastState();
    }

    function deleteDeviceSave() {
        const name = els.savedLayoutsSelect.value;
        if (!name) return;
        openModal({ title: t("deleteSaveTitle"), body: `<p>${escapeHtml(name)}</p>`, actions: [
            { text: t("cancel"), close: true },
            { text: t("delete"), primary: true, onClick: () => { const layouts = readSavedLayouts(); delete layouts[name]; writeSavedLayouts(layouts); refreshSavedLayouts(); closeModal(); } },
        ] });
    }

    async function downloadJsonFile() {
        const name = els.saveNameInput.value.trim() || "island";
        const fileName = `${safeFileName(name)}.json`;
        const json = JSON.stringify(buildSaveData(name), null, 2);
        try {
            const capacitor = window.Capacitor;
            const plugins = capacitor && capacitor.Plugins ? capacitor.Plugins : {};
            const Filesystem = plugins.Filesystem;
            const Share = plugins.Share;
            if (Filesystem && Share) {
                const directory = (window.Capacitor && window.Capacitor.FilesystemDirectory && window.Capacitor.FilesystemDirectory.Cache) || "CACHE";
                const encoding = (window.Capacitor && window.Capacitor.FilesystemEncoding && window.Capacitor.FilesystemEncoding.UTF8) || "utf8";
                const written = await Filesystem.writeFile({ path: fileName, data: json, directory, encoding, recursive: true });
                await Share.share({ title: t("shareTitle"), dialogTitle: t("shareDialogTitle"), url: written.uri });
                return;
            }

            if (navigator.canShare && navigator.share) {
                const file = new File([json], fileName, { type: "application/json" });
                if (navigator.canShare({ files: [file] })) {
                    await navigator.share({ title: t("shareTitle"), files: [file] });
                    return;
                }
            }

            openModal({
                title: t("shareUnavailableTitle"),
                body: `<p>${escapeHtml(t("shareUnavailableText"))}</p>`,
                actions: [{ text: t("ok"), primary: true, close: true }],
            });
        } catch (error) {
            warn(t("shareError", { message: error.message || String(error) }));
        }
    }

    function loadJsonFile(file) {
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const data = JSON.parse(String(reader.result || ""));
                applyStateFromData(data);
                els.jsonBox.value = JSON.stringify(data, null, 2);
                calculateCurrent(true);
                saveLastState();
            } catch (e) {
                warn(t("fileLoadError", { message: e.message }));
            }
        };
        reader.readAsText(file);
    }

    let saveLastTimer = null;
    function saveLastStateThrottled() { clearTimeout(saveLastTimer); saveLastTimer = setTimeout(saveLastState, 500); }
    function saveLastState() { try { localStorage.setItem(LAST_STATE_KEY, JSON.stringify(buildSaveData(els.saveNameInput.value.trim()))); } catch {} }
    function loadLastStateOrTemplate() {
        try {
            const raw = localStorage.getItem(LAST_STATE_KEY);
            if (raw) { applyStateFromData(JSON.parse(raw)); return; }
        } catch {}
        if (templates.length) applyStateFromData(templates[0]);
    }

    function showStartupFlow() {
        const seen = localStorage.getItem(UPDATE_SEEN_KEY);
        if (seen !== APP_VERSION) {
            showUpdateModal(() => {
                localStorage.setItem(UPDATE_SEEN_KEY, APP_VERSION);
                if (!localStorage.getItem(LANGUAGE_KEY)) showLanguageModal(true);
            });
            return;
        }
        if (!localStorage.getItem(LANGUAGE_KEY)) showLanguageModal(true);
    }

    function currentChangelog() {
        const lang = normalizeLanguageCode(appLanguage);
        return CHANGELOG[lang] || CHANGELOG.en || CHANGELOG.ru || [];
    }

    function showUpdateModal(afterClose) {
        openModal({
            title: `${t("updateTitle")} v${APP_VERSION}`,
            body: changelogHtml(currentChangelog()[0] || { version: APP_VERSION, items: [] }),
            actions: [{ text: t("ok"), primary: true, close: true }],
            onClose: afterClose,
        });
    }

    function showLanguageModal(firstRun) {
        const buttons = LANGUAGES.map((lang) => `<button class="flag-btn" data-lang="${lang.code}" type="button"><span class="flag">${lang.flag}</span><span class="flag-name">${escapeHtml(lang.name)}</span></button>`).join("");
        openModal({ title: t("languageTitle"), body: `<div class="flag-grid">${buttons}</div>`, actions: firstRun ? [] : [{ text: t("cancel"), close: true }] });
        els.modalBody.querySelectorAll("button[data-lang]").forEach((button) => button.addEventListener("click", () => confirmLanguage(button.dataset.lang)));
    }

    function confirmLanguage(code) {
        const lang = LANGUAGES.find((l) => l.code === code) || LANGUAGES[0];
        const previousLanguage = appLanguage;
        appLanguage = code;
        const msg = t("languageConfirm", { language: `${lang.flag} ${lang.name}` });
        const title = t("languageConfirmTitle");
        const yes = t("yes");
        const no = t("no");
        appLanguage = previousLanguage;
        openModal({ title, body: `<p>${escapeHtml(msg)}</p>`, actions: [
            { text: no, close: true },
            { text: yes, primary: true, onClick: () => { appLanguage = code; localStorage.setItem(LANGUAGE_KEY, code); applyLanguage(code); closeModal(); } },
        ] });
    }

    function applyLanguage(code) {
        appLanguage = code || appLanguage || "ru";
        document.documentElement.lang = appLanguage;
        document.title = t("appTitle");
        document.querySelectorAll("[data-i18n]").forEach((node) => { node.textContent = t(node.dataset.i18n); });
        document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => { node.placeholder = t(node.dataset.i18nPlaceholder); });
        document.querySelectorAll("[data-i18n-label]").forEach((label) => {
            const key = label.dataset.i18nLabel;
            const first = Array.from(label.childNodes).find((n) => n.nodeType === Node.TEXT_NODE);
            if (first) first.textContent = t(key) + "\n";
        });
        for (const kind of ["source", "generator", "radiator"]) {
            const item = getSelectedItem(kind);
            if (item) getTypeInput(kind).value = catalogItemName(item);
            updateLevelSelect(kind, parseInt(getLevelSelect(kind).value, 10) || 1);
            renderTypeMenu(kind, true);
            updateComboButtons(kind);
        }
        updateEquipmentInfo();
        renderGrid();
        refreshSavedLayouts();
        renderChangelog();
        if (lastResult) renderResult(lastResult);
        else renderAutoLog(null);
    }

    function normalizeLanguageCode(code) {
        const raw = String(code || "ru");
        if (I18N[raw]) return raw;
        const base = raw.split("-")[0];
        return I18N[base] ? base : "en";
    }

    function t(key, values = {}) {
        const lang = normalizeLanguageCode(appLanguage);
        const dictionary = I18N[lang] || I18N.en || I18N.ru || {};
        const fallback = I18N.en || I18N.ru || {};
        let text = dictionary[key] || fallback[key] || (I18N.ru && I18N.ru[key]) || key;
        for (const [name, value] of Object.entries(values || {})) {
            text = String(text).replaceAll(`{${name}}`, String(value));
        }
        return text;
    }

    function renderChangelog() {
        els.changelogFull.innerHTML = currentChangelog().map(changelogHtml).join("");
    }

    function changelogHtml(entry) {
        return `<div><h3>v${escapeHtml(entry.version)}</h3><ul>${(entry.items || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>`;
    }

    function openModal({ title, body, actions = [], onClose = null }) {
        els.modal.dataset.onClose = onClose ? "1" : "";
        els.modal._onClose = onClose || null;
        els.modalTitle.textContent = title;
        els.modalBody.innerHTML = body;
        els.modalActions.innerHTML = "";
        for (const action of actions) {
            const button = document.createElement("button");
            button.textContent = action.text;
            if (action.primary) button.classList.add("primary");
            button.addEventListener("click", () => {
                if (action.close) closeModal();
                if (action.onClick) action.onClick();
            });
            els.modalActions.appendChild(button);
        }
        els.modalBackdrop.hidden = false;
        els.modal.hidden = false;
    }

    function closeModal() {
        const cb = els.modal._onClose;
        els.modalBackdrop.hidden = true;
        els.modal.hidden = true;
        els.modal._onClose = null;
        if (cb) cb();
    }

    function showBackground(text) { els.backgroundStatus.hidden = false; els.backgroundStatus.textContent = text; }
    function hideBackground() { els.backgroundStatus.hidden = true; }
    function hideBackgroundSoon(text) { showBackground(text); setTimeout(hideBackground, 3500); }
    function showToast(text) { showBackground(text); setTimeout(() => { if (!backgroundState) hideBackground(); }, 1800); }

    function updateDateTime() { els.currentDateTime.textContent = new Date().toLocaleString(appLanguage || "ru-RU"); }

    function compareTuple(a, b) { for (let i = 0; i < Math.max(a.length, b.length); i += 1) { const av = a[i] || 0; const bv = b[i] || 0; if (av > bv) return 1; if (av < bv) return -1; } return 0; }
    function cloneMatrix(m) { return m.map((row) => row.slice()); }
    function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
    function capitalize(text) { return text.charAt(0).toUpperCase() + text.slice(1); }
    function safeFileName(name) { return name.trim().replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_").slice(0, 80) || "island"; }
    function formatDuration(ms) { const sec = Math.max(1, Math.ceil(ms / 1000)); return sec < 60 ? `${sec} ${t("secShort")}` : `${Math.floor(sec / 60)} ${t("minShort")} ${sec % 60} ${t("secShort")}`; }
    function estimateTimeText(elapsedMs, attempts, more) { return formatDuration((elapsedMs / Math.max(1, attempts)) * more); }

    function formatNumber(value, digits = 2) {
        const number = Number(value || 0);
        const abs = Math.abs(number);
        const units = [[1e18, "ab"], [1e15, "aa"], [1e12, "t"], [1e9, "b"], [1e6, "m"], [1e3, "k"]];
        const options = { maximumFractionDigits: digits };
        for (const [factor, suffix] of units) {
            if (abs >= factor) return `${(number / factor).toLocaleString("en-US", options)}${suffix}`;
        }
        return number.toLocaleString("en-US", options);
    }
    function formatPercent(value) { return `${Number(value || 0).toLocaleString(appLanguage || "ru", { maximumFractionDigits: 1 })}%`; }
    function sortByCoordKey(a, b) { const [ar, ac] = a[0].split(",").map(Number); const [br, bc] = b[0].split(",").map(Number); return ar === br ? ac - bc : ar - br; }
    function coordLabel(cellKey) { if (!cellKey) return "—"; const [r, c] = cellKey.split(",").map(Number); return `${r + 1}:${c + 1}`; }
    function escapeHtml(text) { return String(text).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
})();

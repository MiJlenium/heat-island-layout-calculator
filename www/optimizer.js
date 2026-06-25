(function () {
    "use strict";

    const SOURCE = "S";
    const GENERATOR = "G";
    const RADIATOR = "R";
    const EPS = 1e-9;
    const INF = 1e40;
    const NEIGHBORS_8 = [
        [-1, -1], [-1, 0], [-1, 1],
        [0, -1],           [0, 1],
        [1, -1],  [1, 0],  [1, 1],
    ];

    function toInt(value, fallback = 0) {
        const parsed = parseInt(value, 10);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function isInside(rows, cols, r, c) {
        return r >= 0 && r < rows && c >= 0 && c < cols;
    }

    function key(cell) {
        return `${cell[0]},${cell[1]}`;
    }

    function fromKey(cellKey) {
        return cellKey.split(",").map(Number);
    }

    function neighbors8(rows, cols, cell) {
        const result = [];
        const [r, c] = cell;
        for (const [dr, dc] of NEIGHBORS_8) {
            const nr = r + dr;
            const nc = c + dc;
            if (isInside(rows, cols, nr, nc)) {
                result.push([nr, nc]);
            }
        }
        return result;
    }

    function cellSet(cells) {
        return new Set(cells.map(key));
    }

    function matrix(rows, cols, value) {
        return Array.from({ length: rows }, () => Array.from({ length: cols }, () => value));
    }

    function sanitizeGrid(rows, cols, source, fallback) {
        return Array.from({ length: rows }, (_, r) =>
            Array.from({ length: cols }, (_, c) => {
                if (source && source[r] && typeof source[r][c] !== "undefined") {
                    return source[r][c];
                }
                return fallback;
            })
        );
    }

    function getItems(kind) {
        const catalog = window.HIO_CATALOG;
        if (kind === "source") return catalog.sources;
        if (kind === "generator") return catalog.generators;
        return catalog.radiators;
    }

    function findItem(items, name, defaultName) {
        const findByCurrentName = (value) => {
            const lowerValue = String(value || "").trim().toLowerCase();
            if (!lowerValue) return null;
            return items.find((item) => {
                const names = Object.values(item.names || {});
                return [item.id, item.name, ...names]
                    .filter(Boolean)
                    .some((candidate) => String(candidate).trim().toLowerCase() === lowerValue);
            }) || null;
        };
        return findByCurrentName(name)
            || findByCurrentName(defaultName)
            || items[0];
    }

    function findLevel(item, levelValue, defaultLevel = 1) {
        const levels = item.levels || [];
        if (!levels.length) {
            return { level: 1, value: 0, display: "0" };
        }

        const level = toInt(levelValue, defaultLevel);
        const exact = levels.find((row) => row.level === level);
        if (exact) return exact;

        const safeLevel = clamp(defaultLevel, 1, levels.length);
        return levels[safeLevel - 1];
    }

    function resolveParams(rawParams = {}) {
        const catalog = window.HIO_CATALOG;
        const defaults = catalog.defaults;

        const sourceItem = findItem(catalog.sources, rawParams.source_type, defaults.source_type);
        const sourceDefaultLevel = (sourceItem.id === defaults.source_type || sourceItem.name === defaults.source_type) ? defaults.source_level : 1;
        const sourceLevel = findLevel(sourceItem, rawParams.source_level, sourceDefaultLevel);

        const generatorItem = findItem(catalog.generators, rawParams.generator_type, defaults.generator_type);
        const generatorDefaultLevel = (generatorItem.id === defaults.generator_type || generatorItem.name === defaults.generator_type) ? defaults.generator_level : 1;
        const generatorLevel = findLevel(generatorItem, rawParams.generator_level, generatorDefaultLevel);

        const radiatorItem = findItem(catalog.radiators, rawParams.radiator_type, defaults.radiator_type);
        const radiatorDefaultLevel = (radiatorItem.id === defaults.radiator_type || radiatorItem.name === defaults.radiator_type) ? defaults.radiator_level : 1;
        const radiatorLevel = findLevel(radiatorItem, rawParams.radiator_level, radiatorDefaultLevel);

        return {
            source_type: sourceItem.id || sourceItem.name,
            source_level: sourceLevel.level,
            source_display: sourceLevel.display,
            source_heat: Number(sourceLevel.value || 0),
            source_is_direct: Boolean(sourceItem.direct),
            direct_waste_ratio: Number(sourceItem.direct_waste_ratio || 0),
            generator_type: generatorItem.id || generatorItem.name,
            generator_level: generatorLevel.level,
            generator_display: generatorLevel.display,
            generator_limit: Number(generatorLevel.value || 0),
            waste_ratio: Number(catalog.normal_waste_ratio || 0.25),
            radiator_type: radiatorItem.id || radiatorItem.name,
            radiator_level: radiatorLevel.level,
            radiator_display: radiatorLevel.display,
            radiator_cooling: Number(radiatorLevel.value || 0),
            generator_buffer: 0,
        };
    }

    function normalizePayload(data) {
        const rows = clamp(toInt(data.rows, 20), 1, 50);
        const cols = clamp(toInt(data.cols, 20), 1, 50);
        const buildableRaw = sanitizeGrid(rows, cols, data.buildable, true).map((row) => row.map(Boolean));
        const obstaclesRaw = sanitizeGrid(rows, cols, data.obstacles, false).map((row) => row.map(Boolean));
        const buildingsRaw = sanitizeGrid(rows, cols, data.buildings, null);

        const buildable = matrix(rows, cols, true);
        const obstacles = matrix(rows, cols, false);
        const buildings = matrix(rows, cols, null);

        for (let r = 0; r < rows; r += 1) {
            for (let c = 0; c < cols; c += 1) {
                buildable[r][c] = Boolean(buildableRaw[r][c]);
                obstacles[r][c] = buildable[r][c] ? Boolean(obstaclesRaw[r][c]) : false;
                const obj = buildingsRaw[r][c];
                buildings[r][c] = buildable[r][c] && [SOURCE, GENERATOR, RADIATOR].includes(obj) ? obj : null;
                if (buildings[r][c]) obstacles[r][c] = false;
            }
        }

        return {
            rows,
            cols,
            buildable,
            obstacles,
            buildings,
            params: resolveParams(data.params || {}),
            allow_obstacles: typeof data.allow_obstacles === "undefined" ? true : Boolean(data.allow_obstacles),
        };
    }

    function collectCells(buildings) {
        const sources = [];
        const generators = [];
        const radiators = [];
        for (let r = 0; r < buildings.length; r += 1) {
            for (let c = 0; c < buildings[r].length; c += 1) {
                if (buildings[r][c] === SOURCE) sources.push([r, c]);
                if (buildings[r][c] === GENERATOR) generators.push([r, c]);
                if (buildings[r][c] === RADIATOR) radiators.push([r, c]);
            }
        }
        return { sources, generators, radiators };
    }

    class Dinic {
        constructor(n) {
            this.graph = Array.from({ length: n }, () => []);
        }

        addEdge(v, to, cap) {
            const f = this.graph[v].length;
            const b = this.graph[to].length;
            this.graph[v].push({ to, rev: b, cap });
            this.graph[to].push({ to: v, rev: f, cap: 0 });
            return f;
        }

        maxFlow(source, sink) {
            let flow = 0;
            const n = this.graph.length;
            while (true) {
                const level = Array.from({ length: n }, () => -1);
                const queue = [source];
                level[source] = 0;
                for (let qi = 0; qi < queue.length; qi += 1) {
                    const v = queue[qi];
                    for (const edge of this.graph[v]) {
                        if (edge.cap > EPS && level[edge.to] < 0) {
                            level[edge.to] = level[v] + 1;
                            queue.push(edge.to);
                        }
                    }
                }
                if (level[sink] < 0) break;

                const it = Array.from({ length: n }, () => 0);
                const dfs = (v, pushed) => {
                    if (v === sink) return pushed;
                    while (it[v] < this.graph[v].length) {
                        const edge = this.graph[v][it[v]];
                        if (edge.cap > EPS && level[v] + 1 === level[edge.to]) {
                            const tr = dfs(edge.to, Math.min(pushed, edge.cap));
                            if (tr > EPS) {
                                edge.cap -= tr;
                                this.graph[edge.to][edge.rev].cap += tr;
                                return tr;
                            }
                        }
                        it[v] += 1;
                    }
                    return 0;
                };

                while (true) {
                    const pushed = dfs(source, INF);
                    if (pushed <= EPS) break;
                    flow += pushed;
                }
            }
            return flow;
        }
    }

    function allocateCooling(rows, cols, consumers, radiators, consumerDemands, radiatorCooling) {
        const consumerIndex = new Map(consumers.map((cell, index) => [key(cell), index]));
        const radiatorIndex = new Map(radiators.map((cell, index) => [key(cell), index]));
        const sourceNode = 0;
        const radiatorOffset = 1;
        const consumerOffset = radiatorOffset + radiators.length;
        const sinkNode = consumerOffset + consumers.length;
        const dinic = new Dinic(sinkNode + 1);

        for (const radiator of radiators) {
            dinic.addEdge(sourceNode, radiatorOffset + radiatorIndex.get(key(radiator)), Math.max(0, radiatorCooling));
        }

        const edgeRefs = new Map();
        const consumerSet = cellSet(consumers);
        for (const radiator of radiators) {
            const ridx = radiatorIndex.get(key(radiator));
            const radNode = radiatorOffset + ridx;
            for (const consumer of neighbors8(rows, cols, radiator)) {
                const consumerKey = key(consumer);
                if (consumerSet.has(consumerKey)) {
                    const consumerNode = consumerOffset + consumerIndex.get(consumerKey);
                    const edgeIndex = dinic.addEdge(radNode, consumerNode, INF);
                    edgeRefs.set(`${key(radiator)}|${consumerKey}`, { radNode, edgeIndex, radiator: key(radiator), consumer: consumerKey });
                }
            }
        }

        for (const consumer of consumers) {
            const demand = Math.max(0, consumerDemands.get(key(consumer)) || 0);
            dinic.addEdge(consumerOffset + consumerIndex.get(key(consumer)), sinkNode, demand);
        }

        dinic.maxFlow(sourceNode, sinkNode);

        const radiatorUsed = new Map(radiators.map((cell) => [key(cell), 0]));
        const consumerCooled = new Map(consumers.map((cell) => [key(cell), 0]));
        const consumerLinks = new Map(consumers.map((cell) => [key(cell), []]));

        for (const ref of edgeRefs.values()) {
            const edge = dinic.graph[ref.radNode][ref.edgeIndex];
            const reverse = dinic.graph[edge.to][edge.rev];
            const used = reverse.cap;
            if (used > EPS) {
                radiatorUsed.set(ref.radiator, (radiatorUsed.get(ref.radiator) || 0) + used);
                consumerCooled.set(ref.consumer, (consumerCooled.get(ref.consumer) || 0) + used);
                consumerLinks.get(ref.consumer).push({ cell: ref.radiator, used, capacity: radiatorCooling });
            }
        }

        return { radiatorUsed, consumerCooled, consumerLinks };
    }

    function evaluateDirectLayout(rows, cols, buildable, buildings, params) {
        const sourceHeat = Math.max(0, params.source_heat);
        const directWasteRatio = Math.max(0, params.direct_waste_ratio);
        const radiatorCooling = Math.max(0, params.radiator_cooling);
        const { sources, generators, radiators } = collectCells(buildings);
        const sourceSet = cellSet(sources);
        const radiatorSet = cellSet(radiators);
        const warnings = [];
        const sourceReports = {};
        const radiatorReports = {};
        const generatorReports = {};

        for (const source of sources) {
            const neighborRadiators = neighbors8(rows, cols, source).filter((n) => radiatorSet.has(key(n)));
            const wasteHeat = sourceHeat * directWasteRatio;
            sourceReports[key(source)] = {
                row: source[0], col: source[1], direct: true,
                direct_output: sourceHeat,
                waste_heat: wasteHeat,
                neighbor_generators: [],
                neighbor_radiators: neighborRadiators.map(key),
                share_per_generator: 0,
                total_output: sourceHeat,
                cooling_capacity: neighborRadiators.length * radiatorCooling,
                cooling_used: 0,
                uncooled_heat: wasteHeat,
                stable: false,
                radiators: [],
            };
            if (!neighborRadiators.length) {
                warnings.push(`Ветротурбина ${source[0] + 1}:${source[1] + 1} не касается радиатора.`);
            }
        }

        for (const radiator of radiators) {
            const neighborSources = neighbors8(rows, cols, radiator).filter((n) => sourceSet.has(key(n)));
            radiatorReports[key(radiator)] = {
                row: radiator[0], col: radiator[1],
                neighbor_generators: [],
                neighbor_sources: neighborSources.map(key),
                counted: Boolean(neighborSources.length),
                capacity: radiatorCooling,
                used: 0,
            };
            if (!neighborSources.length) {
                warnings.push(`Радиатор ${radiator[0] + 1}:${radiator[1] + 1} не касается ветротурбин и простаивает.`);
            }
        }

        const demands = new Map(sources.map((source) => [key(source), sourceHeat * directWasteRatio]));
        const { radiatorUsed, consumerCooled, consumerLinks } = allocateCooling(rows, cols, sources, radiators, demands, radiatorCooling);

        for (const radiator of radiators) {
            radiatorReports[key(radiator)].used = radiatorUsed.get(key(radiator)) || 0;
        }

        let stableSources = 0;
        let directOutput = 0;
        let wasteTotal = 0;
        for (const source of sources) {
            const report = sourceReports[key(source)];
            const cooled = consumerCooled.get(key(source)) || 0;
            const uncooled = Math.max(0, report.waste_heat - cooled);
            report.cooling_used = cooled;
            report.uncooled_heat = uncooled;
            report.stable = uncooled <= 1e-6 && report.waste_heat > 0;
            report.radiators = (consumerLinks.get(key(source)) || []).sort((a, b) => a.cell.localeCompare(b.cell));
            wasteTotal += report.waste_heat;
            if (report.stable) {
                stableSources += 1;
                directOutput += sourceHeat;
            } else if (report.waste_heat > 0) {
                warnings.push(`Ветротурбина ${source[0] + 1}:${source[1] + 1} перегревается: не охлаждается ${formatRaw(uncooled)}.`);
            }
        }

        for (const gen of generators) {
            generatorReports[key(gen)] = {
                row: gen[0], col: gen[1], input_raw: 0, input_accepted: 0, input_over_limit: 0,
                waste_heat: 0, cooling_capacity: 0, cooling_used: 0, uncooled_heat: 0,
                stable: false, load_percent: 0, cooling_percent: 0, sources: [], radiators: [],
            };
            warnings.push(`Генератор ${gen[0] + 1}:${gen[1] + 1} не нужен для ветротурбинного режима.`);
        }

        const totalCells = countBuildable(buildable);
        const coolingCapacityTotal = radiators.reduce((sum, radiator) => sum + (radiatorReports[key(radiator)].counted ? radiatorCooling : 0), 0);
        const coolingUsedTotal = Array.from(radiatorUsed.values()).reduce((a, b) => a + b, 0);
        const occupiedCells = sources.length + generators.length + radiators.length;
        const usefulSources = Object.values(sourceReports).filter((row) => (row.direct_output || 0) > EPS).length;
        const usefulRadiators = Object.values(radiatorReports).filter((row) => (row.used || 0) > EPS).length;
        const idleRadiators = Object.values(radiatorReports).filter((row) => (row.used || 0) <= EPS).length;
        const inactiveSources = Math.max(0, sources.length - usefulSources);
        const inactiveGenerators = generators.length;
        const uselessCells = inactiveSources + inactiveGenerators + idleRadiators;
        const usefulCells = usefulSources + usefulRadiators;
        const emptyCells = Math.max(0, totalCells - occupiedCells);
        const fillPercent = totalCells > 0 ? occupiedCells / totalCells * 100 : 0;
        const stableLinks = Object.values(sourceReports)
            .filter((row) => row.stable && (row.direct_output || 0) > EPS)
            .reduce((sum, row) => sum + (row.radiators || []).filter((link) => (link.used || 0) > EPS).length, 0);
        const score = directOutput - (wasteTotal - coolingUsedTotal > EPS ? 1e12 : 0);

        return {
            params,
            stats: {
                direct_mode: true,
                buildable_cells: totalCells,
                sources: sources.length,
                active_sources: usefulSources,
                stable_sources: stableSources,
                generators: generators.length,
                active_generators: 0,
                stable_generators: 0,
                radiators: radiators.length,
                raw_heat_to_generators: 0,
                accepted_heat: directOutput,
                over_limit_heat: 0,
                waste_heat: wasteTotal,
                cooling_capacity: coolingCapacityTotal,
                cooling_used: coolingUsedTotal,
                occupied_cells: occupiedCells,
                useful_cells: usefulCells,
                useless_cells: uselessCells,
                inactive_sources: inactiveSources,
                inactive_generators: inactiveGenerators,
                empty_cells: emptyCells,
                fill_percent: fillPercent,
                idle_radiators: idleRadiators,
                stable_links: stableLinks,
                score,
            },
            sources: sourceReports,
            generators: generatorReports,
            radiators: radiatorReports,
            warnings,
        };
    }

    function evaluateLayout(rows, cols, buildable, buildings, params) {
        if (params.source_is_direct) {
            return evaluateDirectLayout(rows, cols, buildable, buildings, params);
        }

        const sourceHeat = Math.max(0, params.source_heat);
        const generatorLimit = Math.max(0, params.generator_limit);
        const wasteRatio = Math.max(0, params.waste_ratio);
        const radiatorCooling = Math.max(0, params.radiator_cooling);
        const { sources, generators, radiators } = collectCells(buildings);
        const generatorSet = cellSet(generators);
        const radiatorSet = cellSet(radiators);
        const warnings = [];
        const sourceReports = {};
        const generatorReports = {};
        const radiatorReports = {};

        for (const gen of generators) {
            generatorReports[key(gen)] = {
                row: gen[0], col: gen[1], input_raw: 0, input_accepted: 0, input_over_limit: 0,
                waste_heat: 0, cooling_capacity: 0, cooling_used: 0, uncooled_heat: 0,
                stable: false, load_percent: 0, cooling_percent: 0, work_time: null, cooldown_time: null,
                duty_percent: null, sources: [], radiators: [],
            };
        }

        for (const source of sources) {
            const gens = neighbors8(rows, cols, source).filter((n) => generatorSet.has(key(n)));
            const share = gens.length ? sourceHeat / gens.length : 0;
            sourceReports[key(source)] = {
                row: source[0], col: source[1], direct: false,
                neighbor_generators: gens.map(key),
                share_per_generator: share,
                total_output: gens.length ? sourceHeat : 0,
            };
            if (!gens.length) {
                warnings.push(`Источник ${source[0] + 1}:${source[1] + 1} не касается генераторов и ничего не отдаёт.`);
            } else if (gens.length > 1) {
                warnings.push(`Источник ${source[0] + 1}:${source[1] + 1} связан с ${gens.length} генераторами. Тепло на каждый генератор: ${formatRaw(share)}.`);
            }
            for (const gen of gens) {
                const report = generatorReports[key(gen)];
                report.input_raw += share;
                report.sources.push({ cell: key(source), heat: share });
            }
        }

        const generatorWaste = new Map();
        for (const gen of generators) {
            const report = generatorReports[key(gen)];
            report.input_accepted = Math.min(report.input_raw, generatorLimit);
            report.input_over_limit = Math.max(0, report.input_raw - generatorLimit);
            report.waste_heat = report.input_accepted * wasteRatio;
            report.load_percent = generatorLimit > 0 ? report.input_accepted / generatorLimit * 100 : 0;
            generatorWaste.set(key(gen), report.waste_heat);
            if (report.input_raw <= 0) {
                warnings.push(`Генератор ${gen[0] + 1}:${gen[1] + 1} не получает тепло.`);
            } else if (report.input_over_limit > 0) {
                warnings.push(`Генератор ${gen[0] + 1}:${gen[1] + 1} получает тепла больше лимита; лишнее: ${formatRaw(report.input_over_limit)}.`);
            }
        }

        for (const radiator of radiators) {
            const gens = neighbors8(rows, cols, radiator).filter((n) => generatorSet.has(key(n)));
            radiatorReports[key(radiator)] = {
                row: radiator[0], col: radiator[1],
                neighbor_generators: gens.map(key),
                neighbor_sources: [],
                counted: Boolean(gens.length),
                capacity: radiatorCooling,
                used: 0,
            };
            if (!gens.length) {
                warnings.push(`Радиатор ${radiator[0] + 1}:${radiator[1] + 1} не касается генераторов и простаивает.`);
            }
        }

        const { radiatorUsed, consumerCooled, consumerLinks } = allocateCooling(rows, cols, generators, radiators, generatorWaste, radiatorCooling);
        for (const radiator of radiators) {
            radiatorReports[key(radiator)].used = radiatorUsed.get(key(radiator)) || 0;
        }

        for (const gen of generators) {
            const report = generatorReports[key(gen)];
            const connectedRadiators = neighbors8(rows, cols, gen).filter((n) => radiatorSet.has(key(n)));
            const coolingUsed = consumerCooled.get(key(gen)) || 0;
            const uncooled = Math.max(0, report.waste_heat - coolingUsed);
            report.cooling_capacity = connectedRadiators.length * radiatorCooling;
            report.cooling_used = coolingUsed;
            report.uncooled_heat = uncooled;
            report.stable = uncooled <= 1e-6;
            report.cooling_percent = report.waste_heat > 0 ? coolingUsed / report.waste_heat * 100 : 0;
            report.radiators = (consumerLinks.get(key(gen)) || []).sort((a, b) => a.cell.localeCompare(b.cell));
            if (!report.stable) {
                warnings.push(`Генератор ${gen[0] + 1}:${gen[1] + 1} перегревается: не охлаждается ${formatRaw(uncooled)}.`);
            }
        }

        const totalCells = countBuildable(buildable);
        const acceptedHeat = Object.values(generatorReports).reduce((sum, row) => sum + row.input_accepted, 0);
        const rawHeat = Object.values(generatorReports).reduce((sum, row) => sum + row.input_raw, 0);
        const wasteHeat = Object.values(generatorReports).reduce((sum, row) => sum + row.waste_heat, 0);
        const coolingCapacityTotal = radiators.reduce((sum, radiator) => sum + (radiatorReports[key(radiator)].counted ? radiatorCooling : 0), 0);
        const coolingUsedTotal = Object.values(generatorReports).reduce((sum, row) => sum + row.cooling_used, 0);
        const overLimit = Object.values(generatorReports).reduce((sum, row) => sum + row.input_over_limit, 0);
        const stableGens = Object.values(generatorReports).filter((row) => row.stable && row.input_accepted > 0).length;
        const activeGens = Object.values(generatorReports).filter((row) => row.input_accepted > 0).length;
        const occupiedCells = sources.length + generators.length + radiators.length;
        const usefulSources = Object.values(sourceReports).filter((row) => (row.total_output || 0) > EPS).length;
        const usefulRadiators = Object.values(radiatorReports).filter((row) => (row.used || 0) > EPS).length;
        const idleRadiators = Object.values(radiatorReports).filter((row) => (row.used || 0) <= EPS).length;
        const stableSourceGeneratorLinks = Object.values(generatorReports)
            .filter((row) => row.stable && (row.input_accepted || 0) > EPS)
            .reduce((sum, row) => sum + (row.sources || []).filter((link) => (link.heat || 0) > EPS).length, 0);
        const inactiveSources = Math.max(0, sources.length - usefulSources);
        const inactiveGenerators = Math.max(0, generators.length - activeGens);
        const uselessCells = inactiveSources + inactiveGenerators + idleRadiators;
        const usefulCells = usefulSources + activeGens + usefulRadiators;
        const emptyCells = Math.max(0, totalCells - occupiedCells);
        const fillPercent = totalCells > 0 ? occupiedCells / totalCells * 100 : 0;
        let score = acceptedHeat;
        if (Object.values(generatorReports).some((row) => !row.stable && row.input_accepted > 0)) {
            score -= 1e12;
        }

        return {
            params,
            stats: {
                direct_mode: false,
                buildable_cells: totalCells,
                sources: sources.length,
                active_sources: 0,
                stable_sources: 0,
                generators: generators.length,
                radiators: radiators.length,
                active_generators: activeGens,
                stable_generators: stableGens,
                raw_heat_to_generators: rawHeat,
                accepted_heat: acceptedHeat,
                over_limit_heat: overLimit,
                waste_heat: wasteHeat,
                cooling_capacity: coolingCapacityTotal,
                cooling_used: coolingUsedTotal,
                occupied_cells: occupiedCells,
                useful_cells: usefulCells,
                useless_cells: uselessCells,
                inactive_sources: inactiveSources,
                inactive_generators: inactiveGenerators,
                empty_cells: emptyCells,
                fill_percent: fillPercent,
                idle_radiators: idleRadiators,
                stable_links: stableSourceGeneratorLinks,
                score,
            },
            sources: sourceReports,
            generators: generatorReports,
            radiators: radiatorReports,
            warnings,
        };
    }

    function countBuildable(buildable) {
        let count = 0;
        for (const row of buildable) {
            for (const cell of row) {
                if (cell) count += 1;
            }
        }
        return count;
    }

    function patternBBoxArea(cells) {
        const rows = cells.map((cell) => cell[0]);
        const cols = cells.map((cell) => cell[1]);
        return (Math.max(...rows) - Math.min(...rows) + 1) * (Math.max(...cols) - Math.min(...cols) + 1);
    }

    function calcHeatForSets(rows, cols, generators, sources, sourceHeat, generatorLimit) {
        const generatorSet = cellSet(generators);
        const rawByGen = new Map(generators.map((gen) => [key(gen), 0]));
        for (const source of sources) {
            const gens = neighbors8(rows, cols, source).filter((n) => generatorSet.has(key(n)));
            if (!gens.length) continue;
            const share = sourceHeat / gens.length;
            for (const gen of gens) {
                rawByGen.set(key(gen), (rawByGen.get(key(gen)) || 0) + share);
            }
        }
        const acceptedByGen = new Map();
        let sum = 0;
        for (const [genKey, raw] of rawByGen.entries()) {
            const accepted = Math.min(raw, generatorLimit);
            acceptedByGen.set(genKey, accepted);
            sum += accepted;
        }
        return { heat: sum, acceptedByGen };
    }

    function selectSourcesForCluster(rows, cols, generators, candidateSources, sourceHeat, generatorLimit, wasteRatio, coolingCapacity, rng) {
        const selected = [];
        const remaining = candidateSources.slice();
        const maxHeatByCooling = wasteRatio > 0 ? coolingCapacity / wasteRatio : INF;
        const minGoodGain = sourceHeat * 0.30;
        let currentHeat = 0;

        while (remaining.length) {
            let bestIndex = -1;
            let bestHeat = currentHeat;
            let bestSortValue = null;
            for (let i = 0; i < remaining.length; i += 1) {
                const cell = remaining[i];
                const trialSources = selected.concat([cell]);
                const { heat, acceptedByGen } = calcHeatForSets(rows, cols, generators, trialSources, sourceHeat, generatorLimit);
                if (heat > maxHeatByCooling + EPS) continue;
                const gain = heat - currentHeat;
                if (gain <= EPS) continue;
                const loads = Array.from(acceptedByGen.values()).filter((value) => value > EPS);
                const minLoad = loads.length ? Math.min(...loads) : 0;
                const spread = loads.length ? Math.max(...loads) - minLoad : 0;
                const noise = rng ? rng() * sourceHeat * 0.03 : 0;
                const sortValue = [
                    gain + noise,
                    minLoad,
                    -spread,
                    -Math.abs(cell[0] - generators[0][0]) - Math.abs(cell[1] - generators[0][1]),
                ];
                if (!bestSortValue || compareTuple(sortValue, bestSortValue) > 0) {
                    bestIndex = i;
                    bestHeat = heat;
                    bestSortValue = sortValue;
                }
            }
            if (bestIndex < 0) break;
            const bestGain = bestHeat - currentHeat;
            if (selected.length && bestGain < minGoodGain) break;
            selected.push(remaining[bestIndex]);
            remaining.splice(bestIndex, 1);
            currentHeat = bestHeat;
            const fullTarget = Math.min(generators.length * generatorLimit, maxHeatByCooling);
            if (currentHeat >= fullTarget - sourceHeat * 0.05) break;
        }

        const finalHeat = calcHeatForSets(rows, cols, generators, selected, sourceHeat, generatorLimit);
        const activeGenerators = Array.from(finalHeat.acceptedByGen.values()).filter((value) => value > EPS).length;
        return {
            sources: sortCells(selected),
            heat: finalHeat.heat,
            waste: finalHeat.heat * wasteRatio,
            active_generators: activeGenerators,
            accepted_by_generator: finalHeat.acceptedByGen,
        };
    }

    function countSourceConflictSlots(rows, cols, buildable, sources, ownGenerators, ownCells) {
        const blocked = new Set();
        for (const source of sources) {
            for (const n of neighbors8(rows, cols, source)) {
                const nKey = key(n);
                if (!ownGenerators.has(nKey) && !ownCells.has(nKey) && buildable[n[0]][n[1]]) {
                    blocked.add(nKey);
                }
            }
        }
        return blocked.size;
    }

    function combinations(items, size, limit = Infinity) {
        const result = [];
        const combo = [];
        function backtrack(start) {
            if (result.length >= limit) return;
            if (combo.length === size) {
                result.push(combo.map((item) => item.slice()));
                return;
            }
            for (let i = start; i <= items.length - (size - combo.length); i += 1) {
                combo.push(items[i]);
                backtrack(i + 1);
                combo.pop();
                if (result.length >= limit) return;
            }
        }
        backtrack(0);
        return result;
    }

    function makePattern(generators, sources, radiators, heat, waste, sourceConflictSlots) {
        const cells = sortCells([].concat(generators, sources, radiators));
        return {
            generators: sortCells(generators),
            sources: sortCells(sources),
            radiators: sortCells(radiators),
            heat,
            waste,
            cells,
            cellKeys: new Set(cells.map(key)),
            density: heat / cells.length,
            bbox_area: patternBBoxArea(cells),
            source_conflict_slots: sourceConflictSlots,
        };
    }

    function buildDirectPatterns(rows, cols, buildable, params) {
        const sourceHeat = Math.max(0, params.source_heat);
        const wastePerSource = sourceHeat * Math.max(0, params.direct_waste_ratio);
        const radiatorCooling = Math.max(0, params.radiator_cooling);
        if (sourceHeat <= 0 || wastePerSource <= 0 || radiatorCooling <= 0) return [];

        const patterns = [];
        for (let rr = 0; rr < rows; rr += 1) {
            for (let rc = 0; rc < cols; rc += 1) {
                const radiator = [rr, rc];
                if (!buildable[rr][rc]) continue;
                const sourceSlots = neighbors8(rows, cols, radiator).filter((n) => buildable[n[0]][n[1]]);
                if (!sourceSlots.length) continue;
                const maxSources = Math.min(sourceSlots.length, Math.floor(radiatorCooling / wastePerSource));
                if (maxSources <= 0) continue;
                const sizes = Array.from(new Set([maxSources, maxSources - 1, 1])).filter((size) => size >= 1 && size <= sourceSlots.length).sort((a, b) => b - a);
                for (const sourceCount of sizes) {
                    let combos = combinations(sourceSlots, sourceCount, 80);
                    combos.sort((a, b) => sumCells(a, 0) - sumCells(b, 0) || sumCells(a, 1) - sumCells(b, 1));
                    combos = combos.slice(0, 40);
                    for (const sources of combos) {
                        const heat = sourceCount * sourceHeat;
                        const waste = sourceCount * wastePerSource;
                        if (waste <= radiatorCooling + EPS) {
                            patterns.push(makePattern([], sources, [radiator], heat, waste, 0));
                        }
                    }
                }
            }
        }
        return sortPatterns(patterns);
    }

    function buildPatterns(rows, cols, buildable, params, rng) {
        if (params.source_is_direct) {
            return buildDirectPatterns(rows, cols, buildable, params);
        }

        const sourceHeat = Math.max(0, params.source_heat);
        const generatorLimit = Math.max(0, params.generator_limit);
        const wasteRatio = Math.max(0, params.waste_ratio);
        const radiatorCooling = Math.max(0, params.radiator_cooling);
        if (sourceHeat <= 0 || generatorLimit <= 0) return [];

        const patterns = [];
        const maxPatternsPerRadiator = 30;

        for (let rr = 0; rr < rows; rr += 1) {
            for (let rc = 0; rc < cols; rc += 1) {
                const radiator = [rr, rc];
                if (!buildable[rr][rc]) continue;
                const generatorSlots = neighbors8(rows, cols, radiator).filter((n) => buildable[n[0]][n[1]]);
                if (!generatorSlots.length) continue;
                const radiatorPatterns = [];
                let maxGeneratorsByCooling = generatorSlots.length;
                if (wasteRatio > 0 && radiatorCooling > 0) {
                    maxGeneratorsByCooling = Math.min(
                        generatorSlots.length,
                        Math.max(1, Math.floor(radiatorCooling / (Math.min(sourceHeat, generatorLimit) * wasteRatio)) + 1)
                    );
                } else if (wasteRatio > 0 && radiatorCooling <= 0) {
                    continue;
                }

                const candidateSizes = Array.from(new Set([maxGeneratorsByCooling, maxGeneratorsByCooling - 1, 4, 3, 2, 1]))
                    .filter((size) => size >= 1 && size <= generatorSlots.length)
                    .sort((a, b) => b - a);

                if (generatorSlots.length === 8) {
                    const ringSources = [
                        [rr - 2, rc - 1], [rr - 2, rc + 1],
                        [rr - 1, rc - 2], [rr - 1, rc + 2],
                        [rr + 1, rc - 2], [rr + 1, rc + 2],
                        [rr + 2, rc - 1], [rr + 2, rc + 1],
                    ];
                    const ringOk = ringSources.every(([r, c]) => isInside(rows, cols, r, c) && buildable[r][c]);
                    if (ringOk) {
                        const generators = sortCells(generatorSlots);
                        const sources = sortCells(ringSources);
                        const ringHeat = calcHeatForSets(rows, cols, generators, sources, sourceHeat, generatorLimit);
                        const activeRingGenerators = Array.from(ringHeat.acceptedByGen.values()).filter((value) => value > EPS).length;
                        const heat = ringHeat.heat;
                        const waste = heat * wasteRatio;
                        if (heat > EPS && activeRingGenerators === generators.length && waste <= radiatorCooling + EPS) {
                            const cells = new Set([radiator].concat(generators, sources).map(key));
                            const conflictSlots = countSourceConflictSlots(rows, cols, buildable, sources, cellSet(generators), cells);
                            radiatorPatterns.push(makePattern(generators, sources, [radiator], heat, waste, conflictSlots));
                        }
                    }
                }

                for (const genCount of candidateSizes) {
                    let generatorCombos = combinations(generatorSlots, genCount, 80);
                    if (generatorCombos.length > 25) {
                        generatorCombos.sort((a, b) => {
                            const scoreA = adjacencyScore(a);
                            const scoreB = adjacencyScore(b);
                            return scoreB - scoreA || sumCells(a, 0) - sumCells(b, 0) || sumCells(a, 1) - sumCells(b, 1);
                        });
                        generatorCombos = generatorCombos.slice(0, 25);
                    }
                    for (const generators of generatorCombos) {
                        const generatorSet = cellSet(generators);
                        const occupiedBase = new Set([key(radiator), ...generators.map(key)]);
                        const sourceCandidateMap = new Map();
                        for (const gen of generators) {
                            for (const cell of neighbors8(rows, cols, gen)) {
                                const cellKey = key(cell);
                                if (!occupiedBase.has(cellKey) && buildable[cell[0]][cell[1]]) {
                                    sourceCandidateMap.set(cellKey, cell);
                                }
                            }
                        }
                        const sourceCandidates = Array.from(sourceCandidateMap.values()).sort((a, b) => {
                            const aTouches = neighbors8(rows, cols, a).filter((n) => generatorSet.has(key(n))).length;
                            const bTouches = neighbors8(rows, cols, b).filter((n) => generatorSet.has(key(n))).length;
                            return bTouches - aTouches
                                || Math.abs(a[0] - rr) + Math.abs(a[1] - rc) - (Math.abs(b[0] - rr) + Math.abs(b[1] - rc))
                                || a[0] - b[0]
                                || a[1] - b[1];
                        });
                        if (!sourceCandidates.length) continue;
                        const selected = selectSourcesForCluster(rows, cols, generators, sourceCandidates, sourceHeat, generatorLimit, wasteRatio, radiatorCooling, rng);
                        if (selected.heat <= EPS || selected.active_generators < generators.length || selected.waste > radiatorCooling + EPS) continue;
                        const cells = new Set([radiator].concat(generators, selected.sources).map(key));
                        const conflictSlots = countSourceConflictSlots(rows, cols, buildable, selected.sources, generatorSet, cells);
                        radiatorPatterns.push(makePattern(generators, selected.sources, [radiator], selected.heat, selected.waste, conflictSlots));
                    }
                }
                patterns.push(...sortPatterns(radiatorPatterns).slice(0, maxPatternsPerRadiator));
            }
        }

        return sortPatterns(patterns);
    }

    function sortPatterns(patterns) {
        return patterns.sort((a, b) => compareTuple(patternSortTuple(b), patternSortTuple(a)));
    }

    function patternSortTuple(p) {
        return [p.density, p.heat, p.generators.length, -p.source_conflict_slots, -p.bbox_area, -p.cells.length];
    }

    function patternIsCompatible(pattern, occupied, selectedGenerators, selectedSources, rows, cols) {
        for (const cellKey of pattern.cellKeys) {
            if (occupied.has(cellKey)) return false;
        }
        if (!pattern.generators.length) return true;

        const newGenerators = cellSet(pattern.generators);
        const newSources = cellSet(pattern.sources);
        for (const source of pattern.sources) {
            for (const n of neighbors8(rows, cols, source)) {
                if (selectedGenerators.has(key(n))) return false;
            }
        }
        for (const sourceKey of selectedSources) {
            const source = fromKey(sourceKey);
            for (const n of neighbors8(rows, cols, source)) {
                if (newGenerators.has(key(n))) return false;
            }
        }
        return true;
    }

    function countIdleRadiators(result) {
        return Object.values(result.radiators || {})
            .filter((row) => (row.used || 0) <= EPS)
            .length;
    }

    function countStableEnergyLinks(result) {
        const stats = result.stats || {};
        if (typeof stats.stable_links === "number") return stats.stable_links;

        if (stats.direct_mode) {
            return Object.values(result.sources || {})
                .filter((row) => row.stable && (row.direct_output || 0) > EPS)
                .reduce((sum, row) => sum + (row.radiators || []).filter((link) => (link.used || 0) > EPS).length, 0);
        }

        return Object.values(result.generators || {})
            .filter((row) => row.stable && (row.input_accepted || 0) > EPS)
            .reduce((sum, row) => sum + (row.sources || []).filter((link) => (link.heat || 0) > EPS).length, 0);
    }

    function resultSortTuple(result) {
        const stats = result.stats || {};
        const active = (stats.active_generators || 0) + (stats.active_sources || 0);
        const stable = (stats.stable_generators || 0) + (stats.stable_sources || 0);
        const unstable = Math.max(0, active - stable);
        const uncooled = Math.max(0, (stats.waste_heat || 0) - (stats.cooling_used || 0));
        const idleRadiators = typeof stats.idle_radiators === "number" ? stats.idle_radiators : countIdleRadiators(result);
        const buildableCells = Math.max(0, stats.buildable_cells || 0);
        const occupiedCells = typeof stats.occupied_cells === "number"
            ? stats.occupied_cells
            : (stats.sources || 0) + (stats.generators || 0) + (stats.radiators || 0);
        const inactiveSources = Math.max(0, stats.inactive_sources || 0);
        const inactiveGenerators = Math.max(0, stats.inactive_generators || 0);
        const uselessCells = typeof stats.useless_cells === "number"
            ? stats.useless_cells
            : inactiveSources + inactiveGenerators + idleRadiators;
        const usefulCells = typeof stats.useful_cells === "number" ? stats.useful_cells : Math.max(0, occupiedCells - uselessCells);
        const emptyCells = buildableCells > 0 ? Math.max(0, buildableCells - occupiedCells) : 0;
        const stableLinks = countStableEnergyLinks(result);
        const usefulFillPercent = buildableCells > 0 ? usefulCells / buildableCells * 100 : 0;

        return [
            -unstable,                   // перегретые постройки почти всегда проигрывают
            -uncooled,                   // меньше неохлаждённого тепла
            -inactiveGenerators,          // генератор без тепла — это потерянная клетка
            -inactiveSources,             // источник без потребителя — тоже потерянная клетка
            -idleRadiators,               // радиатор без нагрузки не должен улучшать схему
            stats.accepted_heat || 0,     // больше реально принятого тепла
            stableLinks,                  // больше полностью охлаждённых связок источник → генератор
            usefulCells,                  // больше полезно занятых клеток
            usefulFillPercent,            // меньше пустых клеток, но только за счёт полезных построек
            -emptyCells,                  // дополнительный tie-breaker по пустотам
            stable,                       // больше стабильных активных построек
            -(stats.over_limit_heat || 0),
        ];
    }

    function activeUnstableConsumers(result, directMode) {
        const table = directMode ? result.sources : result.generators;
        return Object.entries(table || {})
            .filter(([, row]) => {
                const active = directMode ? (row.direct_output || 0) > EPS : (row.input_accepted || 0) > EPS;
                return active && !row.stable && (row.uncooled_heat || 0) > EPS;
            })
            .sort((a, b) => (b[1].uncooled_heat || 0) - (a[1].uncooled_heat || 0));
    }

    function repairCooling(rows, cols, buildable, placeable, buildings, params) {
        const directMode = Boolean(params.source_is_direct);
        const maxExtraRadiators = Math.max(1, Math.floor(rows * cols / 3));
        let repaired = cloneMatrix(buildings);
        let result = evaluateLayout(rows, cols, buildable, repaired, params);

        for (let step = 0; step < maxExtraRadiators; step += 1) {
            const hot = activeUnstableConsumers(result, directMode);
            if (!hot.length) break;

            const candidateMap = new Map();
            for (const [consumerKey, consumer] of hot) {
                const cell = fromKey(consumerKey);
                for (const n of neighbors8(rows, cols, cell)) {
                    const nKey = key(n);
                    if (!placeable[n[0]][n[1]]) continue;
                    if (repaired[n[0]][n[1]]) continue;
                    const gain = Math.min(params.radiator_cooling || 0, consumer.uncooled_heat || 0);
                    const existing = candidateMap.get(nKey) || { cell: n, gain: 0, count: 0, distanceScore: 0 };
                    existing.gain += gain;
                    existing.count += 1;
                    existing.distanceScore -= Math.abs(n[0] - cell[0]) + Math.abs(n[1] - cell[1]);
                    candidateMap.set(nKey, existing);
                }
            }

            const candidates = Array.from(candidateMap.values()).sort((a, b) => compareTuple(
                [b.gain, b.count, b.distanceScore, -b.cell[0], -b.cell[1]],
                [a.gain, a.count, a.distanceScore, -a.cell[0], -a.cell[1]]
            ));
            if (!candidates.length || candidates[0].gain <= EPS) break;

            const [r, c] = candidates[0].cell;
            repaired[r][c] = RADIATOR;
            result = evaluateLayout(rows, cols, buildable, repaired, params);
        }

        return { buildings: repaired, result };
    }

    function pruneIdleRadiators(rows, cols, buildable, buildings, params) {
        let pruned = cloneMatrix(buildings);
        let current = evaluateLayout(rows, cols, buildable, pruned, params);
        let changed = true;

        while (changed) {
            changed = false;
            const radiators = collectCells(pruned).radiators
                .filter((radiator) => {
                    const report = current.radiators[key(radiator)];
                    return report && (report.used || 0) <= EPS;
                })
                .sort((a, b) => {
                    const ar = current.radiators[key(a)] || {};
                    const br = current.radiators[key(b)] || {};
                    const ac = (ar.neighbor_generators || []).length + (ar.neighbor_sources || []).length;
                    const bc = (br.neighbor_generators || []).length + (br.neighbor_sources || []).length;
                    return ac - bc || a[0] - b[0] || a[1] - b[1];
                });

            for (const radiator of radiators) {
                const [r, c] = radiator;
                const candidate = cloneMatrix(pruned);
                candidate[r][c] = null;
                const candidateResult = evaluateLayout(rows, cols, buildable, candidate, params);

                if (compareTuple(resultSortTuple(candidateResult), resultSortTuple(current)) >= 0) {
                    pruned = candidate;
                    current = candidateResult;
                    changed = true;
                    break;
                }
            }
        }

        return { buildings: pruned, result: current };
    }

    function autoPlaceGreedy(patterns, rows, cols, rng, topPool = 1) {
        const buildings = matrix(rows, cols, null);
        const occupied = new Set();
        const selectedGenerators = new Set();
        const selectedSources = new Set();

        while (true) {
            const candidates = [];
            for (const pattern of patterns) {
                if (patternIsCompatible(pattern, occupied, selectedGenerators, selectedSources, rows, cols)) {
                    candidates.push(pattern);
                    if (candidates.length >= topPool) break;
                }
            }
            if (!candidates.length) break;
            let pattern = candidates[0];
            if (rng && candidates.length > 1) {
                const totalWeight = candidates.reduce((sum, _p, index) => sum + candidates.length - index, 0);
                let pick = rng() * totalWeight;
                for (let i = 0; i < candidates.length; i += 1) {
                    pick -= candidates.length - i;
                    if (pick <= 0) {
                        pattern = candidates[i];
                        break;
                    }
                }
            }
            for (const [r, c] of pattern.generators) buildings[r][c] = GENERATOR;
            for (const [r, c] of pattern.sources) buildings[r][c] = SOURCE;
            for (const [r, c] of pattern.radiators) buildings[r][c] = RADIATOR;
            for (const cellKey of pattern.cellKeys) occupied.add(cellKey);
            for (const gen of pattern.generators) selectedGenerators.add(key(gen));
            for (const source of pattern.sources) selectedSources.add(key(source));
        }
        return buildings;
    }

    function autoPlace(payload) {
        const normalized = normalizePayload(payload);
        const { rows, cols, buildable, obstacles, params, allow_obstacles } = normalized;
        const attempts = clamp(toInt(payload.attempts, 5000), 1, 5000);
        const seed = Number.isFinite(Number(payload.seed)) ? Number(payload.seed) : 20260621;
        const rng = mulberry32(seed);
        const placeable = matrix(rows, cols, false);
        for (let r = 0; r < rows; r += 1) {
            for (let c = 0; c < cols; c += 1) {
                placeable[r][c] = buildable[r][c] && (allow_obstacles || !obstacles[r][c]);
            }
        }

        const patterns = buildPatterns(rows, cols, placeable, params, rng);
        if (!patterns.length) {
            const result = evaluateLayout(rows, cols, buildable, matrix(rows, cols, null), params);
            result.buildings = matrix(rows, cols, null);
            result.used_obstacles = 0;
            result.attempts_done = 0;
            result.best_attempt = 0;
            result.search_seed = seed;
            return result;
        }

        let bestBuildings = null;
        let bestResult = null;
        let bestAttempt = 0;
        const candidateOrders = [
            patterns,
            patterns.slice().sort((a, b) => a.radiators[0][0] - b.radiators[0][0] || a.radiators[0][1] - b.radiators[0][1] || b.density - a.density),
            patterns.slice().sort((a, b) => a.radiators[0][0] - b.radiators[0][0] || b.radiators[0][1] - a.radiators[0][1] || b.density - a.density),
            patterns.slice().sort((a, b) => b.radiators[0][0] - a.radiators[0][0] || a.radiators[0][1] - b.radiators[0][1] || b.density - a.density),
            patterns.slice().sort((a, b) => b.radiators[0][0] - a.radiators[0][0] || b.radiators[0][1] - a.radiators[0][1] || b.density - a.density),
            patterns.slice().sort((a, b) => compareTuple(
                [b.density, -b.source_conflict_slots, -b.bbox_area, b.generators.length, b.sources.length],
                [a.density, -a.source_conflict_slots, -a.bbox_area, a.generators.length, a.sources.length]
            )),
        ];

        let attemptNo = 0;
        const consider = (buildings) => {
            attemptNo += 1;
            const repaired = repairCooling(rows, cols, buildable, placeable, buildings, params);
            const result = repaired.result;
            if (!bestResult || compareTuple(resultSortTuple(result), resultSortTuple(bestResult)) > 0) {
                bestResult = result;
                bestBuildings = cloneMatrix(repaired.buildings);
                bestAttempt = attemptNo;
            }
        };

        for (const order of candidateOrders) {
            if (attemptNo >= attempts) break;
            consider(autoPlaceGreedy(order, rows, cols, null, 1));
        }

        while (attemptNo < attempts) {
            const shuffled = patterns.slice();
            shuffle(shuffled, rng);
            shuffled.sort((a, b) => {
                const at = [
                    a.density + rng() * a.density * 0.10,
                    a.heat + rng() * a.heat * 0.04,
                    a.generators.length + a.sources.length * 0.1,
                    -a.source_conflict_slots + rng() * 2,
                    -a.bbox_area,
                ];
                const bt = [
                    b.density + rng() * b.density * 0.10,
                    b.heat + rng() * b.heat * 0.04,
                    b.generators.length + b.sources.length * 0.1,
                    -b.source_conflict_slots + rng() * 2,
                    -b.bbox_area,
                ];
                return compareTuple(bt, at);
            });
            const topPool = Math.floor(rng() * 11) + 2;
            consider(autoPlaceGreedy(shuffled, rows, cols, rng, topPool));
        }

        const result = bestResult || evaluateLayout(rows, cols, buildable, matrix(rows, cols, null), params);
        result.buildings = bestBuildings || matrix(rows, cols, null);
        result.used_obstacles = countUsedObstacles(obstacles, result.buildings);
        result.attempts_done = attemptNo;
        result.best_attempt = bestAttempt;
        result.search_seed = seed;
        return result;
    }

    function evaluate(payload) {
        const normalized = normalizePayload(payload);
        return evaluateLayout(normalized.rows, normalized.cols, normalized.buildable, normalized.buildings, normalized.params);
    }

    function resize(payload) {
        const normalized = normalizePayload(payload);
        return {
            rows: normalized.rows,
            cols: normalized.cols,
            buildable: normalized.buildable,
            obstacles: normalized.obstacles,
            buildings: normalized.buildings,
            params: normalized.params,
            allow_obstacles: normalized.allow_obstacles,
        };
    }

    function countUsedObstacles(obstacles, buildings) {
        let count = 0;
        for (let r = 0; r < obstacles.length; r += 1) {
            for (let c = 0; c < obstacles[r].length; c += 1) {
                if (obstacles[r][c] && buildings[r][c]) count += 1;
            }
        }
        return count;
    }

    function cloneMatrix(source) {
        return source.map((row) => row.slice());
    }

    function sortCells(cells) {
        return cells.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    }

    function compareTuple(a, b) {
        for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
            const av = a[i] || 0;
            const bv = b[i] || 0;
            if (av > bv) return 1;
            if (av < bv) return -1;
        }
        return 0;
    }

    function sumCells(cells, index) {
        return cells.reduce((sum, cell) => sum + cell[index], 0);
    }

    function adjacencyScore(cells) {
        let score = 0;
        for (let i = 0; i < cells.length; i += 1) {
            for (let j = i + 1; j < cells.length; j += 1) {
                if (Math.abs(cells[i][0] - cells[j][0]) <= 1 && Math.abs(cells[i][1] - cells[j][1]) <= 1) score += 1;
            }
        }
        return score;
    }

    function shuffle(items, rng) {
        for (let i = items.length - 1; i > 0; i -= 1) {
            const j = Math.floor(rng() * (i + 1));
            [items[i], items[j]] = [items[j], items[i]];
        }
    }

    function mulberry32(seed) {
        let t = seed >>> 0;
        return function () {
            t += 0x6D2B79F5;
            let x = t;
            x = Math.imul(x ^ (x >>> 15), x | 1);
            x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
            return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
        };
    }

    function formatRaw(value, digits = 2) {
        const number = Number(value || 0);
        const abs = Math.abs(number);
        const units = [[1e18, "ab"], [1e15, "aa"], [1e12, "t"], [1e9, "b"], [1e6, "m"], [1e3, "k"]];
        const options = { maximumFractionDigits: digits };
        for (const [factor, suffix] of units) {
            if (abs >= factor) return `${(number / factor).toLocaleString("en-US", options)}${suffix}`;
        }
        return number.toLocaleString("en-US", options);
    }

    window.HIO_OPTIMIZER = {
        SOURCE,
        GENERATOR,
        RADIATOR,
        resolveParams,
        normalizePayload,
        evaluate,
        autoPlace,
        resize,
        matrix,
    };
})();

(function () {
    "use strict";

    const SUFFIXES = {
        "": 1,
        "k": 1_000,
        "к": 1_000,
        "m": 1_000_000,
        "м": 1_000_000,
        "b": 1_000_000_000,
        "в": 1_000_000_000,
        "t": 1_000_000_000_000,
        "т": 1_000_000_000_000,
        "aa": 1_000_000_000_000_000,
        "аа": 1_000_000_000_000_000,
        "ab": 1_000_000_000_000_000_000,
        "ав": 1_000_000_000_000_000_000,
    };

    function parseGameNumber(raw) {
        if (typeof raw === "number") return raw;
        let text = String(raw).trim().toLowerCase().replace(/\s+/g, "").replace(",", ".");
        const suffixes = Object.keys(SUFFIXES).filter(Boolean).sort((a, b) => b.length - a.length);
        for (const suffix of suffixes) {
            if (text.endsWith(suffix)) {
                text = text.slice(0, -suffix.length);
                return Number(text) * SUFFIXES[suffix];
            }
        }
        return Number(text) * SUFFIXES[""];
    }

    function formatLevelDisplay(value) {
        return String(value)
            .trim()
            .replaceAll(",", ".")
            .replaceAll("аа", "aa")
            .replaceAll("ав", "ab")
            .replaceAll("к", "k")
            .replaceAll("м", "m")
            .replaceAll("в", "b")
            .replaceAll("т", "t");
    }

    function makeItem(id, ru, en, levels, options = {}) {
        return {
            id,
            name: ru,
            names: { ru, en },
            direct: Boolean(options.direct),
            direct_waste_ratio: Number(options.directWasteRatio || 0),
            levels: levels.map((value, index) => ({
                level: index + 1,
                value: parseGameNumber(value),
                display: formatLevelDisplay(value),
            })),
        };
    }

    const NORMAL_WASTE_RATIO = 0.25;
    const WIND_WASTE_RATIO = 0.20;

    const sources = [
        makeItem("wind_turbine", "Ветротурбина", "Wind Turbine", ["1,25", "2,5", "3,75", "6,25", "8,75"], { direct: true, directWasteRatio: WIND_WASTE_RATIO }),
        makeItem("solar_panel", "Солнечная панель", "Solar Panel", ["20", "25", "31", "39", "49", "61"]),
        makeItem("coal_plant", "Угольная электростанция", "Coal Plant", ["160", "200", "250", "313", "391", "488"]),
        makeItem("hydro_plant", "Гидроэлектростанция", "Hydro Plant", ["1,28к", "1,6к", "2к", "2,5к", "3,12к", "3,9к"]),
        makeItem("gas_plant", "Газовая электростанция", "Gas Plant", ["10,2к", "12,8к", "16к", "20к", "25к", "31,2к"]),
        makeItem("heliothermal_plant", "Гелиотермальная башня", "Heliothermal Plant", ["81,9к", "102к", "128к", "160к", "200к", "250к"]),
        makeItem("geothermal_plant", "Геотермальная электростанция", "Geothermal Plant", ["655к", "819к", "1,02м", "1,28м", "1,6м", "2м"]),
        makeItem("biomass_plant", "Биомассовая электростанция", "Biomass Plant", ["5,24м", "6,55м", "8,19м", "10,2м", "12,8м", "16м"]),
        makeItem("nuclear_reactor", "Ядерный реактор", "Nuclear Reactor", ["41,9м", "52,4м", "65,5м", "81,9м", "102м", "128м"]),
        makeItem("fusion_reactor", "Термоядерный реактор", "Fusion Reactor", ["336м", "419м", "524м", "655м", "819м", "1,02в"]),
        makeItem("arc_reactor", "Дуговой реактор", "Arc Reactor", ["2,68в", "3,36в", "4,19в", "5,24в", "6,55в", "8,19в"]),
        makeItem("antimatter_plant", "Антиматерийная станция", "Antimatter Plant", ["21,5в", "26,8в", "33,6в", "41,9в", "52,4в", "65,5в"]),
        makeItem("quantum_reactor", "Квантовый реактор", "Quantum Reactor", ["172в", "215в", "268в", "336в", "419в", "524в"]),
        makeItem("gravitron_plant", "Гравитроновая электростанция", "Gravitron Plant", ["1,37т", "1,72т", "2,15т", "2,68т", "3,36т", "4,19т"]),
        makeItem("black_hole_reactor", "Реактор чёрной дыры", "Black Hole Reactor", ["11т", "13,7т", "17,2т", "21,5т", "26,8т", "33,6т"]),
        makeItem("hyperspace_core", "Ядро гиперпространства", "HyperSpace Core", ["88т", "110т", "137т", "172т", "215т", "268т"]),
        makeItem("zero_point_reactor", "Реактор нулевой точки", "Zero-Point Reactor", ["704т", "880т", "1,1аа", "1,37аа", "1,72аа", "2,15аа"]),
        makeItem("divine_reactor", "Божественный реактор", "Divine Reactor", ["5,63аа", "7,04аа", "8,8аа", "11аа", "13,7аа", "17,2аа"]),
        makeItem("chaos_core", "Ядро хаоса", "Chaos Core", ["45аа", "56,3аа", "70,4аа", "88аа", "110аа", "137аа"]),
        makeItem("psionic_tower", "Псионическая башня", "Psionic Tower", ["360аа", "450аа", "563аа", "704аа", "880аа", "1,1ав"]),
        makeItem("all_seeing_eye", "Всевидящее око", "The All Seeing Eye", ["2,88ав", "3,6ав", "4,5ав", "5,63ав", "7,04ав", "8,8ав"]),
        makeItem("neurogrid_reactor", "Реактор NeuroGrid", "NeuroGrid Reactor", ["23,1ав", "28,8ав", "36ав", "45ав", "56,3ав", "70,4ав"]),
    ];

    const generators = [
        makeItem("generator_1", "Генератор 1", "Generator 1", ["80", "160", "320", "640", "1,28к", "2,56к"]),
        makeItem("generator_2", "Генератор 2", "Generator 2", ["40,9к", "81,9к", "163к", "327к", "655к", "1,31м"]),
        makeItem("generator_3", "Генератор 3", "Generator 3", ["31,5м", "62,9м", "126м", "252м", "503м", "1,01в", "2,01в", "4,03в"]),
        makeItem("generator_4", "Генератор 4", "Generator 4", ["85,9в", "172в", "344в", "687в", "1,37т", "2,75т"]),
        makeItem("generator_5", "Генератор 5", "Generator 5", ["66т", "132т", "264т", "528т", "1,06аа", "2,11аа", "4,22аа", "8,44аа", "16,9аа"]),
        makeItem("generator_6", "Генератор 6", "Generator 6", ["270аа", "540аа", "1,08ав", "2,16ав", "4,32ав", "8,65ав", "17,3ав", "34,6ав", "69,2ав"]),
    ];

    const radiators = [
        makeItem("heat_sink_1", "Радиатор 1", "Heat Sink 1", ["8", "14,4", "25,9", "46,7", "84", "151"]),
        makeItem("heat_sink_2", "Радиатор 2", "Heat Sink 2", ["3,2к", "5,76к", "10,3к", "18,6к", "33,5к", "60,4к"]),
        makeItem("heat_sink_3", "Радиатор 3", "Heat Sink 3", ["1,64м", "2,95м", "5,31м", "9,56м", "17,2м", "31м"]),
        makeItem("heat_sink_4", "Радиатор 4", "Heat Sink 4", ["1,51в", "2,72в", "4,89в", "8,81в", "15,9в", "28,5в", "51,4в", "92,4в"]),
        makeItem("heat_sink_5", "Радиатор 5", "Heat Sink 5", ["4,12т", "7,42т", "13,4т", "24т", "43,3т", "77,9т", "140т", "252т", "453т"]),
        makeItem("heat_sink_6", "Радиатор 6", "Heat Sink 6", ["16,9аа", "30,4аа", "54,7аа", "98,5аа", "177аа", "319аа", "574аа", "1,03ав", "1,86ав", "3,35ав", "6,03ав"]),
    ];

    window.HIO_CATALOG = {
        sources,
        generators,
        radiators,
        normal_waste_ratio: NORMAL_WASTE_RATIO,
        wind_waste_ratio: WIND_WASTE_RATIO,
        defaults: {
            source_type: "geothermal_plant",
            source_level: 4,
            generator_type: "generator_2",
            generator_level: 6,
            radiator_type: "heat_sink_3",
            radiator_level: 2,
        },
    };
})();

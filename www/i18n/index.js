(function () {
    "use strict";

    const data = window.HIO_I18N_DATA || {};

    const languages = [
        { code: "en-US", flag: "🇺🇸", name: "English (US)" },
        { code: "en-GB", flag: "🇬🇧", name: "English (UK)" },
        { code: "pl", flag: "🇵🇱", name: "Polski" },
        { code: "de", flag: "🇩🇪", name: "Deutsch" },
        { code: "fr", flag: "🇫🇷", name: "Français" },
        { code: "it", flag: "🇮🇹", name: "Italiano" },
        { code: "es", flag: "🇪🇸", name: "Español" },
        { code: "es-419", flag: "🇦🇷", name: "Español (Latinoamérica)" },
        { code: "pt", flag: "🇵🇹", name: "Português" },
        { code: "pt-BR", flag: "🇧🇷", name: "Português (Brasil)" },
        { code: "nl", flag: "🇳🇱", name: "Nederlands" },
        { code: "sv", flag: "🇸🇪", name: "Svenska" },
        { code: "no", flag: "🇳🇴", name: "Norsk" },
        { code: "da", flag: "🇩🇰", name: "Dansk" },
        { code: "fi", flag: "🇫🇮", name: "Suomi" },
        { code: "cs", flag: "🇨🇿", name: "Čeština" },
        { code: "sk", flag: "🇸🇰", name: "Slovenčina" },
        { code: "uk", flag: "🇺🇦", name: "Українська" },
        { code: "ru", flag: "🇷🇺", name: "Русский" },
        { code: "tr", flag: "🇹🇷", name: "Türkçe" },
        { code: "vi", flag: "🇻🇳", name: "Tiếng Việt" },
        { code: "ms", flag: "🇲🇾", name: "Bahasa Melayu" },
        { code: "id", flag: "🇮🇩", name: "Bahasa Indonesia" },
        { code: "ja", flag: "🇯🇵", name: "日本語" },
        { code: "ko", flag: "🇰🇷", name: "한국어" },
        { code: "zh-CN", flag: "🇨🇳", name: "简体中文" },
        { code: "zh-TW", flag: "🇹🇼", name: "繁體中文" },
    ];

    window.HIO_I18N = {
        languages,
        messages: {
            ru: data.ru || {},
            en: data.en || {},
        },
        changelog: {
            ru: data.ruChangelog || [],
            en: data.enChangelog || [],
        },
    };
})();

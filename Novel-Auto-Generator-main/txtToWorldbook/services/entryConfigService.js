export function createEntryConfigService(deps = {}) {
    const {
        AppState,
        onConfigChanged,
    } = deps;

    function getEntryConfig(category, entryName) {
        const key = `${category}::${entryName}`;
        if (AppState.config.entryPosition[key]) {
            return AppState.config.entryPosition[key];
        }

        // 特殊处理：剧情大纲
        if (category === '剧情大纲') {
            return {
                position: AppState.config.plotOutline.position || 0,
                depth: AppState.config.plotOutline.depth || 4,
                order: AppState.config.plotOutline.order || 100,
                autoIncrementOrder: AppState.config.plotOutline.autoIncrementOrder || false,
            };
        }

        // 优先从分类配置获取
        if (AppState.config.categoryDefault[category]) {
            return { ...AppState.config.categoryDefault[category] };
        }

        // 从自定义分类获取默认配置
        const categoryConfig = AppState.persistent.customCategories.find(c => c.name === category);
        if (categoryConfig) {
            return {
                position: categoryConfig.defaultPosition || 0,
                depth: categoryConfig.defaultDepth || 4,
                order: categoryConfig.defaultOrder || 100,
                autoIncrementOrder: categoryConfig.autoIncrementOrder || false,
            };
        }

        return { position: 0, depth: 4, order: 100, autoIncrementOrder: false };
    }

    function setEntryConfig(category, entryName, config) {
        const key = `${category}::${entryName}`;
        AppState.config.entryPosition[key] = { ...config };
        AppState.settings.entryPositionConfig = AppState.config.entryPosition;
        if (typeof onConfigChanged === 'function') onConfigChanged();
    }

    function getCategoryAutoIncrement(category) {
        // Special handling for plot outline.
        if (category === '剧情大纲') {
            return AppState.config.plotOutline.autoIncrementOrder || false;
        }
        if (AppState.config.categoryDefault[category]?.autoIncrementOrder !== undefined) {
            return AppState.config.categoryDefault[category].autoIncrementOrder;
        }
        const categoryConfig = AppState.persistent.customCategories.find(c => c.name === category);
        return categoryConfig?.autoIncrementOrder || false;
    }

    function getCategoryBaseOrder(category) {
        // Special handling for plot outline.
        if (category === '剧情大纲') {
            return AppState.config.plotOutline.order || 100;
        }
        if (AppState.config.categoryDefault[category]?.order !== undefined) {
            return AppState.config.categoryDefault[category].order;
        }
        const categoryConfig = AppState.persistent.customCategories.find(c => c.name === category);
        return categoryConfig?.defaultOrder || 100;
    }

    function setCategoryDefaultConfig(category, config) {
        AppState.config.categoryDefault[category] = {
            position: config.position !== undefined ? config.position : 0,
            depth: config.depth !== undefined ? config.depth : 4,
            order: config.order !== undefined ? config.order : 100,
            autoIncrementOrder: config.autoIncrementOrder || false,
        };
        AppState.settings.categoryDefaultConfig = AppState.config.categoryDefault;
        if (typeof onConfigChanged === 'function') onConfigChanged();
    }

    return {
        getEntryConfig,
        setEntryConfig,
        getCategoryAutoIncrement,
        getCategoryBaseOrder,
        setCategoryDefaultConfig,
    };
}

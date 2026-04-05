export function createTokenMetricsService(deps = {}) {
    const {
        tokenCacheGet,
    } = deps;

    function getEntryTotalTokens(entry) {
        if (!entry || typeof entry !== 'object') return 0;
        if (typeof tokenCacheGet !== 'function') return 0;

        let total = 0;

        if (entry['关键词']) {
            const keywords = Array.isArray(entry['关键词']) ? entry['关键词'].join(', ') : entry['关键词'];
            total += tokenCacheGet(keywords);
        }

        if (entry['内容']) {
            total += tokenCacheGet(entry['内容']);
        }

        return total;
    }

    return {
        getEntryTotalTokens,
    };
}

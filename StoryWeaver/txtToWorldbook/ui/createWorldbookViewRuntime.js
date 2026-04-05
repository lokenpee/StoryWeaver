import { createWorldbookView } from './worldbookView.js';

export function createWorldbookViewRuntime(deps = {}) {
    return createWorldbookView({
        ListRenderer: deps.ListRenderer,
        naturalSortEntryNames: deps.naturalSortEntryNames,
        escapeHtmlForDisplay: deps.escapeHtmlForDisplay,
        escapeAttrForDisplay: deps.escapeAttrForDisplay,
        EventDelegate: deps.EventDelegate,
        ModalFactory: deps.ModalFactory,
        getCategoryLightState: deps.getCategoryLightState,
        setCategoryLightState: deps.setCategoryLightState,
        getEntryConfig: deps.getEntryConfig,
        getCategoryAutoIncrement: deps.getCategoryAutoIncrement,
        getCategoryBaseOrder: deps.getCategoryBaseOrder,
        getEntryTotalTokens: deps.getEntryTotalTokens,
        getTokenThreshold: () => deps.AppState.ui.tokenThreshold,
        setTokenThreshold: (value) => { deps.AppState.ui.tokenThreshold = value; },
        getManualMergeHighlight: () => deps.AppState.ui.manualMergeHighlight,
        setManualMergeHighlightState: (value) => { deps.AppState.ui.manualMergeHighlight = value; },
        getSearchKeyword: () => deps.AppState.ui.searchKeyword,
        showCategoryConfigModal: deps.showCategoryConfigModal,
        showEntryConfigModal: deps.showEntryConfigModal,
        showRerollEntryModal: deps.showRerollEntryModal,
        getWorldbookToShow: () => (deps.AppState.processing.volumeMode ? deps.getAllVolumesWorldbook() : deps.AppState.worldbook.generated),
        getVolumeCount: () => deps.AppState.worldbook.volumes.length,
        isVolumeMode: () => deps.AppState.processing.volumeMode,
        showManualMergeUI: deps.showManualMergeUI,
        showBatchRerollModal: deps.showBatchRerollModal,
    });
}

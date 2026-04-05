export function createEditorActionsFacade(deps = {}) {
    const {
        categoryEditorModal,
        defaultEntriesView,
    } = deps;

    function showAddCategoryModal() {
        if (!categoryEditorModal) return;
        categoryEditorModal.showAddCategoryModal();
    }

    function showEditCategoryModal(editIndex) {
        if (!categoryEditorModal) return;
        categoryEditorModal.showEditCategoryModal(editIndex);
    }

    function renderDefaultWorldbookEntriesUI() {
        if (!defaultEntriesView) return;
        defaultEntriesView.renderDefaultWorldbookEntriesUI();
    }

    function showAddDefaultEntryModal() {
        if (!defaultEntriesView) return;
        defaultEntriesView.showAddDefaultEntryModal();
    }

    function showEditDefaultEntryModal(editIndex) {
        if (!defaultEntriesView) return;
        defaultEntriesView.showEditDefaultEntryModal(editIndex);
    }

    function saveDefaultWorldbookEntriesUI() {
        if (!defaultEntriesView) return;
        defaultEntriesView.saveDefaultWorldbookEntriesUI();
    }

    return {
        showAddCategoryModal,
        showEditCategoryModal,
        renderDefaultWorldbookEntriesUI,
        showAddDefaultEntryModal,
        showEditDefaultEntryModal,
        saveDefaultWorldbookEntriesUI,
    };
}

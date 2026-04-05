export function createCategoryListView(deps = {}) {
    const {
        AppState,
        ListRenderer,
        EventDelegate,
        hasDefaultCategory,
        saveCustomCategories,
        showEditCategoryModal,
        confirmAction,
        resetSingleCategory,
    } = deps;

    function renderCategoriesList() {
        const listContainer = document.getElementById('ttw-categories-list');
        if (!listContainer) return;

        const html = ListRenderer.renderItems(
            AppState.persistent.customCategories,
            (cat, index) => ListRenderer.renderCategoryItem(cat, index, {
                hasDefault: hasDefaultCategory(cat.name),
            }),
            { emptyMessage: '暂无分类配置' },
        );

        ListRenderer.updateContainer(listContainer, html);

        if (listContainer.dataset.eventsBound === 'true') return;

        EventDelegate.on(listContainer, '.ttw-category-cb', 'change', async (e, cb) => {
            const index = parseInt(cb.dataset.index, 10);
            if (!AppState.persistent.customCategories[index]) return;
            AppState.persistent.customCategories[index].enabled = cb.checked;
            await saveCustomCategories();
        });

        EventDelegate.on(listContainer, '.ttw-edit-cat', 'click', (e, btn) => {
            const index = parseInt(btn.dataset.index, 10);
            showEditCategoryModal(index);
        });

        EventDelegate.on(listContainer, '.ttw-reset-single-cat', 'click', async (e, btn) => {
            const index = parseInt(btn.dataset.index, 10);
            const cat = AppState.persistent.customCategories[index];
            if (!cat) return;
            const confirmed = await confirmAction(`确定重置"${cat.name}"为默认配置吗？`, { title: '重置分类' });
            if (!confirmed) return;
            await resetSingleCategory(index);
            renderCategoriesList();
        });

        EventDelegate.on(listContainer, '.ttw-delete-cat', 'click', async (e, btn) => {
            const index = parseInt(btn.dataset.index, 10);
            const cat = AppState.persistent.customCategories[index];
            if (!cat || cat.isBuiltin) return;
            const confirmed = await confirmAction(`确定删除分类"${cat.name}"吗？`, { title: '删除分类', danger: true });
            if (!confirmed) return;
            AppState.persistent.customCategories.splice(index, 1);
            await saveCustomCategories();
            renderCategoriesList();
        });

        listContainer.dataset.eventsBound = 'true';
    }

    return {
        renderCategoriesList,
    };
}

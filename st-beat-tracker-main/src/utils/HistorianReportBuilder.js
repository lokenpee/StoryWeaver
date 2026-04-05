// FILE: src/utils/HistorianReportBuilder.js

const DEFAULT_MAX_TEXT = 200;

const safeText = (value, maxLen = DEFAULT_MAX_TEXT) => {
    if (value === null || value === undefined) return '';
    let text = '';
    if (typeof value === 'string') {
        text = value;
    } else if (Array.isArray(value)) {
        text = value.filter(Boolean).map(item => String(item)).join('|');
    } else if (typeof value === 'object') {
        try {
            text = JSON.stringify(value);
        } catch (error) {
            text = String(value);
        }
    } else {
        text = String(value);
    }

    const cleaned = text.replace(/\s+/g, ' ').trim();
    if (!maxLen || cleaned.length <= maxLen) return cleaned;
    return `${cleaned.slice(0, maxLen)}...`;
};

const csvEscape = (value) => {
    if (value === null || value === undefined) return '';
    const text = String(value);
    if (!/[",\n]/.test(text)) return text;
    return `"${text.replace(/"/g, '""')}"`;
};

const joinList = (value, separator = '|') => {
    if (!Array.isArray(value) || value.length === 0) return '';
    return value.filter(Boolean).map(String).join(separator);
};

const normalizeCategory = (category) => {
    if (!category) return '';
    return String(category).trim();
};

const buildCharacterLines = (chapter) => {
    const lines = ['[characters] id,name,identity,keywords,appearance,personality,background,goals,capabilities,equipment,experiences,secrets,custom'];
    const characters = chapter?.staticMatrices?.characters || {};
    Object.entries(characters).forEach(([id, data]) => {
        const core = data?.core || data || {};
        const name = safeText(core.name || data?.name);
        const identity = safeText(core.identity || data?.identity);
        const keywords = joinList(core.keywords);
        const appearance = safeText(data?.appearance);
        const personality = safeText(data?.personality);
        const background = safeText(data?.background);
        const goals = safeText(data?.goals);
        const capabilities = safeText(data?.capabilities);
        const equipment = safeText(data?.equipment);
        const experiences = safeText(data?.experiences);
        const secrets = safeText(data?.secrets);
        const custom = safeText(data?.custom);
        lines.push([
            csvEscape(id),
            csvEscape(name),
            csvEscape(identity),
            csvEscape(keywords),
            csvEscape(appearance),
            csvEscape(personality),
            csvEscape(background),
            csvEscape(goals),
            csvEscape(capabilities),
            csvEscape(equipment),
            csvEscape(experiences),
            csvEscape(secrets),
            csvEscape(custom)
        ].join(','));
    });
    return lines;
};

const buildWorldviewLines = (chapter) => {
    const lines = ['[worldview] category,id,name,summary'];
    const worldview = chapter?.staticMatrices?.worldview || {};
    Object.entries(worldview).forEach(([category, entries]) => {
        Object.entries(entries || {}).forEach(([id, data]) => {
            const name = safeText(data?.name || data?.title || '');
            const summary = safeText(data?.summary || data?.description || '');
            lines.push([
                csvEscape(normalizeCategory(category)),
                csvEscape(id),
                csvEscape(name),
                csvEscape(summary)
            ].join(','));
        });
    });
    return lines;
};

const buildStorylineLines = (chapter) => {
    const lines = ['[storylines] category,id,title,status,summary,current_summary'];
    const staticStorylines = chapter?.staticMatrices?.storylines || {};
    const dynamicStorylines = chapter?.dynamicState?.storylines || {};
    Object.entries(staticStorylines).forEach(([category, entries]) => {
        Object.entries(entries || {}).forEach(([id, data]) => {
            const dyn = dynamicStorylines?.[category]?.[id] || {};
            const title = safeText(data?.title || '');
            const status = safeText(dyn?.current_status || data?.status || '');
            const summary = safeText(data?.summary || '');
            const currentSummary = safeText(dyn?.current_summary || '');
            lines.push([
                csvEscape(normalizeCategory(category)),
                csvEscape(id),
                csvEscape(title),
                csvEscape(status),
                csvEscape(summary),
                csvEscape(currentSummary)
            ].join(','));
        });
    });
    return lines;
};

const buildRelationshipLines = (chapter) => {
    const lines = ['[relationships] id,participants,type,type_label,relationship_label,emotional_weight,meeting_status'];
    const edges = chapter?.staticMatrices?.relationship_graph?.edges || [];
    edges.forEach((edge) => {
        const participants = Array.isArray(edge?.participants) ? edge.participants.join('|') : '';
        const meetingStatus = edge?.timeline?.meeting_status || '';
        lines.push([
            csvEscape(edge?.id || ''),
            csvEscape(participants),
            csvEscape(edge?.type || ''),
            csvEscape(edge?.type_label || ''),
            csvEscape(edge?.relationship_label || ''),
            csvEscape(edge?.emotional_weight ?? ''),
            csvEscape(meetingStatus)
        ].join(','));
    });
    return lines;
};

const buildChronologyLines = (chapter) => {
    const chron = chapter?.dynamicState?.chronology || {};
    const lines = [
        '[chronology] day_count,time_slot,weather,last_rest_chapter',
        [
            csvEscape(chron.day_count ?? ''),
            csvEscape(chron.time_slot || ''),
            csvEscape(chron.weather || ''),
            csvEscape(chron.last_rest_chapter || '')
        ].join(',')
    ];
    return lines;
};

const buildRhythmLines = (chapter) => {
    const rhythm = chapter?.meta?.narrative_control_tower?.narrative_rhythm_clock || {};
    const lines = [
        '[rhythm] current_phase,cycle_count,current_phase_duration,recommended_next_phase',
        [
            csvEscape(rhythm.current_phase || ''),
            csvEscape(rhythm.cycle_count ?? ''),
            csvEscape(rhythm.current_phase_duration ?? ''),
            csvEscape(rhythm.recommended_next_phase || '')
        ].join(',')
    ];
    return lines;
};

export const buildHistorianReport = (chapter) => {
    const sections = [];
    sections.push('[report] historian_readonly_view');
    sections.push(...buildCharacterLines(chapter));
    sections.push('');
    sections.push(...buildWorldviewLines(chapter));
    sections.push('');
    sections.push(...buildStorylineLines(chapter));
    sections.push('');
    sections.push(...buildRelationshipLines(chapter));
    sections.push('');
    sections.push(...buildChronologyLines(chapter));
    sections.push('');
    sections.push(...buildRhythmLines(chapter));
    return sections.join('\n');
};

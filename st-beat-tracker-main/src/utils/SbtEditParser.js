// FILE: src/utils/SbtEditParser.js

const TAG_REGEX = /<SbtEdit>([\s\S]*?)<\/SbtEdit>/gi;
const LINE_IGNORE_REGEX = /^\s*(#|\/\/)/;

export const DEFAULT_ALLOWED_FUNCTIONS = new Set([
    'createEntity',
    'updateEntity',
    'deleteEntity',
    'updateStoryline',
    'keepEntity',
    'keepStoryline',
    'updateRelationshipEdge',
    'appendRelationshipEdge',
    'updateCharacterRelationship',
    'updateChronology',
    'setLongTermSummary'
]);

const parseArgs = (argsText) => {
    const trimmed = argsText.trim();
    if (!trimmed) return [];
    return JSON.parse(`[${trimmed}]`);
};

const stripIgnoredLines = (text) => (
    text
        .split(/\r?\n/)
        .filter((line) => !LINE_IGNORE_REGEX.test(line.trim()))
        .join('\n')
);

const extractCommands = (text) => {
    const commands = [];
    const errors = [];
    const len = text.length;
    let i = 0;

    const isIdentStart = (ch) => /[A-Za-z_]/.test(ch);
    const isIdentPart = (ch) => /[A-Za-z0-9_]/.test(ch);

    while (i < len) {
        while (i < len && /\s/.test(text[i])) i += 1;
        if (i >= len) break;

        const ch = text[i];
        if (!isIdentStart(ch)) {
            i += 1;
            continue;
        }

        const nameStart = i;
        i += 1;
        while (i < len && isIdentPart(text[i])) i += 1;
        const name = text.slice(nameStart, i);

        while (i < len && /\s/.test(text[i])) i += 1;
        if (text[i] !== '(') {
            errors.push(`invalid_call:${name}`);
            continue;
        }

        i += 1; // skip '('
        const argsStart = i;
        let depth = 1;
        let inString = false;
        let quote = '';
        let escaped = false;

        while (i < len) {
            const c = text[i];
            if (inString) {
                if (escaped) {
                    escaped = false;
                } else if (c === '\\') {
                    escaped = true;
                } else if (c === quote) {
                    inString = false;
                }
                i += 1;
                continue;
            }

            if (c === '"' || c === "'") {
                inString = true;
                quote = c;
                i += 1;
                continue;
            }

            if (c === '(') {
                depth += 1;
            } else if (c === ')') {
                depth -= 1;
                if (depth === 0) break;
            }
            i += 1;
        }

        if (depth !== 0) {
            errors.push(`unclosed_paren:${name}`);
            break;
        }

        const argsText = text.slice(argsStart, i);
        i += 1; // skip ')'
        while (i < len && /\s/.test(text[i])) i += 1;
        if (text[i] === ';') i += 1;

        try {
            const args = parseArgs(argsText);
            commands.push({ name, args, raw: text.slice(nameStart, i).trim() });
        } catch (error) {
            errors.push(`args_parse_failed:${name}`);
        }
    }

    return { commands, errors };
};

export const parseSbtEdit = (text, options = {}) => {
    const allowed = options.allowedFunctions || DEFAULT_ALLOWED_FUNCTIONS;
    const errors = [];
    const commands = [];

    if (!text || typeof text !== 'string') {
        return { commands, errors: ['empty_response'] };
    }

    const blocks = [];
    let match = null;
    while ((match = TAG_REGEX.exec(text)) !== null) {
        blocks.push(match[1]);
    }

    if (blocks.length === 0) {
        return { commands, errors: ['missing_tag'] };
    }

    const cleaned = stripIgnoredLines(blocks.join('\n'));
    const parsed = extractCommands(cleaned);

    parsed.commands.forEach((command) => {
        if (allowed && !allowed.has(command.name)) {
            errors.push(`not_allowed:${command.name}`);
            return;
        }
        commands.push(command);
    });
    errors.push(...parsed.errors);

    return { commands, errors };
};

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    CHAPTER_SPLIT_TYPES,
    DEFAULT_CHAPTER_SPLIT_TYPE,
    LEGACY_CHAPTER_SPLIT_TYPE_MAP,
    normalizeChapterSplitType,
} from '../../../src/domain/chapter/splitTypes.js';

test('keeps every canonical chapter split type unchanged', () => {
    for (const type of CHAPTER_SPLIT_TYPES) {
        assert.equal(normalizeChapterSplitType(type), type);
    }
});

test('preserves all legacy split type mappings', () => {
    for (const [legacyType, expected] of Object.entries(LEGACY_CHAPTER_SPLIT_TYPE_MAP)) {
        assert.equal(normalizeChapterSplitType(legacyType), expected);
    }
});

test('trims input and falls back exactly like the legacy implementations', () => {
    assert.equal(normalizeChapterSplitType('  time_jump  '), 'time_jump');
    assert.equal(normalizeChapterSplitType(''), DEFAULT_CHAPTER_SPLIT_TYPE);
    assert.equal(normalizeChapterSplitType(null), DEFAULT_CHAPTER_SPLIT_TYPE);
    assert.equal(normalizeChapterSplitType('unknown_type'), DEFAULT_CHAPTER_SPLIT_TYPE);
});

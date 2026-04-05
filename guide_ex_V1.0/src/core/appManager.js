import { eventSource, event_types, generateRaw, getRequestHeaders } from '/script.js';
import { getContext, renderExtensionTemplateAsync } from '/scripts/extensions.js';

export const appManager = {
  eventSource,
  event_types,
  generateRaw,
  getRequestHeaders,
  getContext,
  renderExtensionTemplateAsync,
};

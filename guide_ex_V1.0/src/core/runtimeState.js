export const runtimeState = {
  pendingUserSend: false,
  lastUserSendAt: 0,
  isPromptHandling: false,
  lastPromptHandledAt: 0,
  chatChangedDebounceTimer: null,
  failOpenStreak: 0,
  autoPausedUntil: 0,
};

export function markUserSend() {
  runtimeState.pendingUserSend = true;
  runtimeState.lastUserSendAt = Date.now();
}

export function consumeUserSendFlag() {
  runtimeState.pendingUserSend = false;
}

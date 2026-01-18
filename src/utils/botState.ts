/**
 * Bot State Management
 * Stores runtime state like pause status that doesn't need persistence
 */

interface BotState {
    isPaused: boolean;
    pausedAt: Date | null;
    pausedBy: string | null;
}

const state: BotState = {
    isPaused: false,
    pausedAt: null,
    pausedBy: null,
};

export function isPaused(): boolean {
    return state.isPaused;
}

export function pause(by: string = 'UI'): void {
    state.isPaused = true;
    state.pausedAt = new Date();
    state.pausedBy = by;
}

export function resume(): void {
    state.isPaused = false;
    state.pausedAt = null;
    state.pausedBy = null;
}

export function getState(): BotState {
    return { ...state };
}

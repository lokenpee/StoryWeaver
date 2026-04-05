// src/EventBus.js
import { sbtConsole } from '../utils/sbtConsole.js';
class EventBus {
    constructor() {
        this.events = {};
    }

    on(eventName, callback) {
        if (!this.events[eventName]) {
            this.events[eventName] = [];
        }
        this.events[eventName].push(callback);
    }
    emit(eventName, data) {
        if (this.events[eventName]) {
            this.events[eventName].forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    sbtConsole.error(`[EventBus] Error in event handler for "${eventName}":`, error);
                }
            });
        }
    }
}


export const eventBus = new EventBus();

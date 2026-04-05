export const EventDelegate = {
    on(container, selector, eventType, handler) {
        const delegateHandler = (e) => {
            const target = e.target.closest(selector);
            if (target && container.contains(target)) {
                handler.call(target, e, target);
            }
        };

        container.addEventListener(eventType, delegateHandler);
        return () => container.removeEventListener(eventType, delegateHandler);
    },

    batchOn(container, config) {
        const cleanups = [];

        for (const [selector, events] of Object.entries(config)) {
            for (const [eventType, handler] of Object.entries(events)) {
                cleanups.push(this.on(container, selector, eventType, handler));
            }
        }

        return () => cleanups.forEach((fn) => fn());
    },
};

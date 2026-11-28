'use strict';

function bindTabNavigation(tabs, select) {
    for (const [index, tab] of tabs.entries()) {
        tab.addEventListener('click', () => select(tab));
        tab.addEventListener('keydown', event => {
            let next;
            switch (event.key) {
                case 'ArrowLeft': next = tabs[(index + tabs.length - 1) % tabs.length]; break;
                case 'ArrowRight': next = tabs[(index + 1) % tabs.length]; break;
                case 'Home': next = tabs[0]; break;
                case 'End': next = tabs.at(-1); break;
                default: return;
            }
            event.preventDefault();
            select(next);
        });
    }
}

const monitorTabs = (() => {
    const tabs = [...document.querySelectorAll('#monitor-tabs [role="tab"]')];
    const views = new Map(tabs.map(tab => {
        const panel = document.getElementById(tab.getAttribute('aria-controls'));
        const summary = document.querySelector(`[data-monitor-summary="${panel.id}"]`);
        return [panel.id, {
            tab, panel, count: 0, colorIndex: -1, badge: tab.querySelector('.monitor-badge'),
            summaryBadge: summary.querySelector('.monitor-badge'), summarySpinner: summary.querySelector('.review-spinner'),
            tabSpinner: tab.querySelector('.review-spinner'), headingSpinner: panel.querySelector('h2 .review-spinner')
        }];
    }));
    const overviewBadge = document.querySelector('#monitors-tab .monitor-badge');
    const overviewSpinner = document.querySelector('#monitors-tab .review-spinner');
    let overviewColorIndex = -1;

    bindTabNavigation(tabs, selected => {
        for (const view of views.values()) {
            const active = view.tab === selected;
            view.tab.setAttribute('aria-selected', String(active));
            view.tab.tabIndex = active ? 0 : -1;
            view.panel.hidden = !active;
        }
        selected.focus({preventScroll: true});
    });

    function updateBadge(badge, count, colorIndex) {
        const color = count ? captureResultColors[colorIndex] : '';
        badge.textContent = count ? ` (${count})` : '';
        badge.hidden = count === 0;
        badge.style.color = color;
        return color;
    }

    return {
        setCount(panelId, count, latest) {
            const view = views.get(panelId);
            if (count && (count > view.count || view.latest !== latest)) {
                view.colorIndex = (view.colorIndex + 1) % captureResultColors.length;
                overviewColorIndex = (overviewColorIndex + 1) % captureResultColors.length;
            }
            view.count = count;
            view.latest = latest;
            const total = Array.from(views.values()).reduce((sum, item) => sum + item.count, 0);
            updateBadge(overviewBadge, total, overviewColorIndex);
            updateBadge(view.summaryBadge, count, view.colorIndex);
            return updateBadge(view.badge, count, view.colorIndex);
        },
        setRunning(panelId, running) {
            const view = views.get(panelId);
            view.running = running;
            view.summarySpinner.hidden = !running;
            view.tabSpinner.hidden = !running;
            view.headingSpinner.hidden = !running;
            overviewSpinner.hidden = !Array.from(views.values()).some(item => item.running);
        }
    };
})();

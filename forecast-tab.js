// PSI Dashboard - "Forecast" tab (added 2026-10-21)
// The Weekly Forecast used to sit at the bottom of each brand's Overview, but it ignores the
// Overview filters, search and week range. It now has its own tab after Full History.
//
// How: for each brand this script (1) adds a "Forecast" button to the sub-tab bar, (2) creates a
// new view next to Full History, (3) MOVES the existing forecast card into it (same elements, same
// ids, so the original forecast code and its Model dropdown / Cards-Table toggle keep working
// untouched), and (4) wraps the brand's tab-switch function so the new view is shown, and the
// forecast is redrawn once it is visible (a chart drawn inside a hidden tab has no size).
(function () {
  const BRANDS = [
    { subnav: 'subnav-samsung', attr: 'data-view',   view: 'forecast',   id: 'view-forecast',      cls: 'view',  after: 'view-history',      section: 'forecastSection',       sw: 'switchView',        render: () => renderForecast(computeModels(getEntries()), 'samsung') },
    { subnav: 'subnav-philips', attr: 'data-pview',  view: 'pforecast',  id: 'pview-pforecast',    cls: 'pview', after: 'pview-phistory',    section: 'philipsForecastSection', sw: 'switchPhilipsView', render: () => renderForecast(computePhilipsModels(phGetEntries()), 'philips') },
    { subnav: 'subnav-plocks',  attr: 'data-plview', view: 'plforecast', id: 'plview-plforecast',  cls: 'pview', after: 'plview-plhistory',  section: 'plocksForecastSection',  sw: 'switchPlocksView',  render: () => renderPlocksForecast(computePlocksModels(plGetEntries())) }
  ];

  BRANDS.forEach(b => {
    try {
      const bar = document.querySelector('#' + b.subnav + ' .seg-control');
      const history = document.getElementById(b.after);
      const section = document.getElementById(b.section);
      const original = window[b.sw];
      if (!bar || !history || !section || typeof original !== 'function') return; // anything unexpected: leave this brand alone
      if (document.getElementById(b.id)) return;                                   // already installed

      // the new view, placed right after Full History
      const view = document.createElement('div');
      view.id = b.id;
      view.className = b.cls;
      if (b.cls === 'pview') view.style.display = 'none';
      view.style.paddingTop = '4px';
      history.parentNode.insertBefore(view, history.nextSibling);
      view.appendChild(section); // moves the existing forecast card (ids and listeners stay intact)

      // the new tab button, after Full History
      const btn = document.createElement('button');
      btn.className = 'seg-btn';
      btn.setAttribute(b.attr, b.view);
      btn.textContent = 'Forecast';
      btn.addEventListener('click', () => window[b.sw](b.view));
      bar.appendChild(btn);

      // make the brand's tab switcher aware of the new view
      window[b.sw] = function (name) {
        const result = original.apply(this, arguments);
        if (b.sw === 'switchPlocksView') {
          // Philips Locks' switcher only knows its original three views, so show / hide ours here
          view.style.display = name === b.view ? 'block' : 'none';
        }
        if (name === b.view) setTimeout(() => { try { b.render(); } catch (e) { console.warn('[forecast-tab] redraw failed:', e && e.message); } }, 0);
        return result;
      };
    } catch (e) {
      console.warn('[forecast-tab] could not install for ' + b.subnav + ':', e && e.message);
    }
  });
})();

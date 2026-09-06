/**
 * trivo-students — shared course/path catalog logic.
 *
 * Both the homepage teaser (js/config.js -> renderCourses) and the
 * dedicated courses.html listing page use this so price/hours-breakdown
 * formatting and card markup can never drift between the two places.
 */
(function (global) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function fmtMoney(n) {
    if (typeof n !== 'number' || !isFinite(n)) return '';
    return '\u20b9' + n.toLocaleString('en-IN');
  }

  // Lowest price across all tiers — used for the price range filter and
  // for the "From ₹X" summary line on a multi-tier item. Returns null for
  // contact-for-pricing items (they never have a comparable number) or
  // items with no price rows at all.
  function effectivePriceValue(item) {
    if (item.contactForPricing) return null;
    var vals = (item.prices || []).map(function (p) { return p.value; }).filter(function (v) { return typeof v === 'number' && isFinite(v); });
    if (!vals.length) return null;
    return Math.min.apply(null, vals);
  }

  function formatPriceLine(item) {
    if (item.contactForPricing) return 'Contact for pricing';
    var prices = item.prices || [];
    if (!prices.length) return '';
    if (!item.multiTierPricing || prices.length === 1) {
      var p = prices[0];
      return p.display || fmtMoney(p.value);
    }
    var min = effectivePriceValue(item);
    return 'From ' + fmtMoney(min);
  }

  // Every included <course|path>-card carries these, built once per
  // item so callers (homepage teaser, courses.html) don't repeat the
  // "which fieldVisibility object applies, courses' or paths'" lookup.
  function normalizeItems(cfg) {
    var out = [];
    var courseFV = (cfg.courses && cfg.courses.fieldVisibility) || {};
    var pathFV = (cfg.paths && cfg.paths.fieldVisibility) || {};
    ((cfg.courses && cfg.courses.items) || []).forEach(function (item) {
      if (item.visible === false) return;
      out.push(Object.assign({ _type: 'course', _fv: courseFV }, item));
    });
    ((cfg.paths && cfg.paths.items) || []).forEach(function (item) {
      if (item.visible === false) return;
      out.push(Object.assign({ _type: 'path', _fv: pathFV }, item));
    });
    return out;
  }

  // Paths reference courses by id and are allowed to reference courses
  // that are NOT independently visible (an internal-only course used to
  // build a bundle). This looks a course up by id regardless of its own
  // `visible` flag — callers use it to render "Includes: X, Y, Z" on a
  // path card even if X isn't listed on its own anywhere.
  function findCourseById(cfg, id) {
    return ((cfg.courses && cfg.courses.items) || []).find(function (c) { return c.id === id; }) || null;
  }

  function renderHoursBreakdown(item) {
    if (!item._fv.hoursBreakdown || !(item.hoursBreakdown || []).length) return '';
    return '<ul class="offer-card__breakdown">' + item.hoursBreakdown.map(function (b) {
      return '<li><span>' + esc(b.label) + '</span><span>' + esc(String(b.hours)) + 'h</span></li>';
    }).join('') + '</ul>';
  }

  function renderIncludes(cfg, item) {
    if (item._type !== 'path' || !(item.includesCourseIds || []).length) return '';
    var names = item.includesCourseIds.map(function (id) {
      var c = findCourseById(cfg, id);
      return c ? c.name : null;
    }).filter(Boolean);
    if (!names.length) return '';
    return '<p class="offer-card__includes"><strong>Includes:</strong> ' + esc(names.join(', ')) + '</p>';
  }

  function renderPriceBlock(item) {
    if (!item._fv.price) return '';
    var line = formatPriceLine(item);
    if (!line) return '';
    var tiersHtml = '';
    if (!item.contactForPricing && item.multiTierPricing && (item.prices || []).length > 1) {
      tiersHtml = '<ul class="offer-card__tiers">' + item.prices.map(function (p) {
        return '<li><span>' + esc(p.label || 'Tier') + '</span><span>' + esc(p.display || fmtMoney(p.value)) + '</span></li>';
      }).join('') + '</ul>';
    }
    return '<div class="offer-card__price' + (item.contactForPricing ? ' offer-card__price--contact' : '') + '">' + esc(line) + '</div>' + tiersHtml;
  }

  function renderCard(cfg, item, i, revealEnabled) {
    var fv = item._fv;
    var tags = fv.tags ? (item.tags || []).map(function (t) { return '<span class="tag-pill">' + esc(t) + '</span>'; }).join('') : '';
    var meta = [];
    if (fv.duration && item.duration) meta.push('<span>' + esc(item.duration) + '</span>');
    if (fv.hours && item.hours) meta.push('<span>' + (meta.length ? '\u00b7 ' : '') + item.hours + ' hrs</span>');
    // `data-reveal` drives a scroll-triggered fade-in that depends on an
    // IntersectionObserver set up once at page load. That's the right
    // motion language for the homepage teaser (static content, rendered
    // once) but actively breaks a *dynamically re-rendered* results grid
    // (courses.html re-renders on every filter change — cards injected
    // after the initial observer setup never get scanned, so they'd sit
    // at opacity:0 forever). Callers that re-render on demand pass
    // revealEnabled=false to skip the attribute entirely rather than
    // fighting that timing.
    var revealAttrs = revealEnabled ? ' data-reveal data-delay="' + (i % 4) + '"' : '';
    return '<article class="offer-card course-card' + (item._type === 'path' ? ' offer-card--path' : '') + '"' + revealAttrs + '>' +
      (item._type === 'path' ? '<div class="offer-card__type">Path</div>' : '') +
      (fv.label && item.label ? '<div class="course-card__label">' + esc(item.label) + '</div>' : '') +
      '<h3 class="course-card__title">' + esc(item.name) + '</h3>' +
      (meta.length ? '<div class="course-card__meta">' + meta.join('') + '</div>' : '') +
      (fv.description && item.description ? '<p class="course-card__desc">' + esc(item.description) + '</p>' : '') +
      renderIncludes(cfg, item) +
      renderHoursBreakdown(item) +
      (tags ? '<div class="course-card__tags">' + tags + '</div>' : '') +
      renderPriceBlock(item) +
      '</article>';
  }

  function filterItems(cfg, allItems, filters) {
    var q = (filters.query || '').trim().toLowerCase();
    return allItems.filter(function (item) {
      if (filters.type && filters.type !== 'all' && item._type !== filters.type) return false;
      if (q) {
        var hay = ((item.name || '') + ' ' + (item.description || '')).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      if (filters.tags && filters.tags.length) {
        var itemTags = item.tags || [];
        var matchesAny = filters.tags.some(function (t) { return itemTags.indexOf(t) !== -1; });
        if (!matchesAny) return false;
      }
      if (typeof filters.minWeeks === 'number' && typeof item.durationWeeks === 'number' && item.durationWeeks < filters.minWeeks) return false;
      if (typeof filters.maxWeeks === 'number' && typeof item.durationWeeks === 'number' && item.durationWeeks > filters.maxWeeks) return false;
      if (typeof filters.minPrice === 'number' || typeof filters.maxPrice === 'number') {
        var val = effectivePriceValue(item);
        if (val !== null) {
          if (typeof filters.minPrice === 'number' && val < filters.minPrice) return false;
          if (typeof filters.maxPrice === 'number' && val > filters.maxPrice) return false;
        }
        // contact-for-pricing items have no comparable number — they
        // always pass a price filter rather than being silently excluded
      }
      return true;
    });
  }

  global.TrivoCatalog = {
    esc: esc,
    fmtMoney: fmtMoney,
    effectivePriceValue: effectivePriceValue,
    formatPriceLine: formatPriceLine,
    normalizeItems: normalizeItems,
    findCourseById: findCourseById,
    renderCard: renderCard,
    filterItems: filterItems
  };
})(typeof window !== 'undefined' ? window : this);

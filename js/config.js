/**
 * trivo-students — fetch the public config and render the dynamic
 * sections. Much smaller than trivo-lean's js/config.js since this site
 * has far fewer content types (see README.md "What's temporary here").
 */
(function (global) {
  'use strict';

  var cache = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function fetchConfig() {
    if (cache) return Promise.resolve(cache);
    return fetch('/api/config').then(function (res) {
      if (!res.ok) throw new Error('Could not load site content (' + res.status + ')');
      return res.json();
    }).then(function (data) {
      cache = data;
      return data;
    });
  }

  function onReady(cb) {
    fetchConfig().then(cb).catch(function (err) {
      console.error('trivo-students config load failed:', err);
    });
  }

  function setText(el, text) {
    if (el && el.textContent.trim() !== String(text || '').trim()) el.textContent = text;
  }

  function renderStats(cfg) {
    var s = cfg.gapStats;
    var sec = document.getElementById('statsSection');
    if (!s || s.visible === false) { if (sec) sec.style.display = 'none'; return; }
    setText(document.getElementById('statsKicker'), s.kicker);
    setText(document.getElementById('statsTitle'), s.title);
    var grid = document.getElementById('statsGrid');
    if (grid) {
      grid.innerHTML = (s.items || []).map(function (item) {
        return '<div class="stat-card" data-reveal>' +
          '<div class="stat-card__value">' + esc(item.value) + '</div>' +
          '<div class="stat-card__label">' + esc(item.label) + '</div>' +
          '</div>';
      }).join('');
    }
  }

  function renderOutcomes(cfg) {
    var o = cfg.outcomes;
    var sec = document.getElementById('outcomesSection');
    if (!o || o.visible === false) { if (sec) sec.style.display = 'none'; return; }
    setText(document.getElementById('outcomesKicker'), o.kicker);
    setText(document.getElementById('outcomesTitle'), o.title);
    var grid = document.getElementById('outcomesGrid');
    if (grid) {
      grid.innerHTML = (o.items || []).map(function (item, i) {
        return '<div class="outcome-card" data-reveal data-delay="' + (i % 3) + '">' +
          '<div class="outcome-card__title">' + esc(item.title) + '</div>' +
          '<div class="outcome-card__body">' + esc(item.body) + '</div>' +
          '</div>';
      }).join('');
    }
  }

  function renderSteps(cfg) {
    var h = cfg.howItWorks;
    var sec = document.getElementById('stepsSection');
    if (!h || h.visible === false) { if (sec) sec.style.display = 'none'; return; }
    setText(document.getElementById('stepsKicker'), h.kicker);
    setText(document.getElementById('stepsTitle'), h.title);
    var grid = document.getElementById('stepsGrid');
    if (grid) {
      grid.innerHTML = (h.steps || []).map(function (step, i) {
        return '<div class="step-card" data-reveal data-delay="' + (i % 4) + '">' +
          '<div class="step-card__num">' + String(i + 1).padStart(2, '0') + '</div>' +
          '<div class="step-card__title">' + esc(step.title) + '</div>' +
          '<div class="step-card__body">' + esc(step.body) + '</div>' +
          '</div>';
      }).join('');
    }
  }

  function renderCourses(cfg) {
    var c = cfg.courses;
    var sec = document.getElementById('coursesSection');
    if (!c || c.visible === false) { if (sec) sec.style.display = 'none'; return; }
    setText(document.getElementById('coursesKicker'), c.kicker);
    setText(document.getElementById('coursesTitle'), c.title);
    setText(document.getElementById('coursesNote'), c.note || '');
    var grid = document.getElementById('coursesGrid');
    if (grid) {
      grid.innerHTML = (c.items || []).map(function (item, i) {
        var tags = (item.tags || []).map(function (t) { return '<span class="tag-pill">' + esc(t) + '</span>'; }).join('');
        return '<article class="course-card" data-reveal data-delay="' + (i % 4) + '">' +
          '<div class="course-card__label">' + esc(item.label || '') + '</div>' +
          '<h3 class="course-card__title">' + esc(item.name) + '</h3>' +
          '<div class="course-card__meta"><span>' + esc(item.duration || '') + '</span><span>·</span><span>' + (item.hours || 0) + ' hrs</span></div>' +
          '<p class="course-card__desc">' + esc(item.description || '') + '</p>' +
          '<div class="course-card__tags">' + tags + '</div>' +
          '</article>';
      }).join('');
    }
  }

  function renderFaq(cfg) {
    var f = cfg.faq;
    var sec = document.getElementById('faqSection');
    if (!f || f.visible === false) { if (sec) sec.style.display = 'none'; return; }
    var list = document.getElementById('faqList');
    if (list) {
      var items = (f.items || []).filter(function (i) { return i.visible !== false; });
      list.innerHTML = items.map(function (item, i) {
        return '<details class="faq-item"' + (i === 0 ? ' open' : '') + '>' +
          '<summary>' + esc(item.question) + '</summary>' +
          '<p>' + esc(item.answer) + '</p>' +
          '</details>';
      }).join('');
    }
  }

  function renderHero(cfg) {
    var h = cfg.hero || {};
    setText(document.getElementById('heroKicker'), h.kicker);
    setText(document.getElementById('heroTitle'), h.headline);
    setText(document.getElementById('heroSub'), h.subhead);
    setText(document.getElementById('heroPrimaryCta'), h.primaryCta);
    setText(document.getElementById('heroSecondaryCta'), h.secondaryCta);
  }

  function renderFloatingCta(cfg) {
    var f = cfg.floatingCta;
    var btn = document.getElementById('floatingCta');
    if (!btn) return;
    if (!f || f.visible === false) { btn.style.display = 'none'; return; }
    setText(document.getElementById('floatingCtaLabel'), f.label || 'Register now');
  }

  global.TrivoStudents = {
    load: fetchConfig,
    onReady: onReady,
    esc: esc,
    setText: setText,
    renderHero: renderHero,
    renderStats: renderStats,
    renderOutcomes: renderOutcomes,
    renderSteps: renderSteps,
    renderCourses: renderCourses,
    renderFaq: renderFaq,
    renderFloatingCta: renderFloatingCta
  };
})(typeof window !== 'undefined' ? window : this);

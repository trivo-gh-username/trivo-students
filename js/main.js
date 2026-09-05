(function () {
  'use strict';

  // ── Scroll reveal ──────────────────────────────────────────────────
  function initReveal() {
    if (!('IntersectionObserver' in window)) {
      document.querySelectorAll('[data-reveal]').forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        var delay = Number(el.dataset.delay || 0) * 90;
        setTimeout(function () { el.classList.add('is-visible'); }, delay);
        io.unobserve(el);
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
    document.querySelectorAll('[data-reveal]').forEach(function (el) { io.observe(el); });
  }

  // Re-run reveal wiring after dynamic content is injected (config-driven
  // sections render after this script's initial pass).
  function refreshReveal() {
    document.querySelectorAll('[data-reveal]:not(.is-visible)').forEach(function (el) {
      var rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight * 0.9) el.classList.add('is-visible');
    });
    initReveal();
  }

  // ── Floating "Register now" CTA ────────────────────────────────────
  function initFloatingCta() {
    var btn = document.getElementById('floatingCta');
    var hero = document.querySelector('.hero');
    if (!btn) return;
    if (!hero || !('IntersectionObserver' in window)) {
      btn.classList.add('is-visible');
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        // Visible once the hero has scrolled mostly out of view.
        btn.classList.toggle('is-visible', !entry.isIntersecting);
      });
    }, { threshold: 0.1 });
    io.observe(hero);
  }

  // ── 60-second quiz ──────────────────────────────────────────────────
  function initQuiz(cfg) {
    var quiz = cfg.quiz;
    var card = document.getElementById('quizCard');
    if (!quiz || quiz.visible === false || !card) return;

    var questions = quiz.questions || [];
    var results = quiz.results || {};
    var answers = [];
    var step = 0;

    var progressEl = document.getElementById('quizProgress');
    var bodyEl = document.getElementById('quizBody');

    function renderProgress() {
      progressEl.innerHTML = questions.map(function (_, i) {
        return '<span class="quiz-progress__dot' + (i === step ? ' is-active' : '') + '"></span>';
      }).join('');
    }

    function tally() {
      var counts = {};
      answers.forEach(function (w) { counts[w] = (counts[w] || 0) + 1; });
      var best = 'beginner', bestCount = -1;
      Object.keys(counts).forEach(function (k) {
        if (counts[k] > bestCount) { best = k; bestCount = counts[k]; }
      });
      return best;
    }

    function renderQuestion() {
      var q = questions[step];
      renderProgress();
      bodyEl.innerHTML =
        '<h3 class="quiz-card__title">' + TrivoStudents.esc(q.prompt) + '</h3>' +
        '<div class="quiz-options">' +
        q.options.map(function (opt) {
          return '<button type="button" class="quiz-option" data-weight="' + TrivoStudents.esc(opt.weight) + '">' + TrivoStudents.esc(opt.label) + '</button>';
        }).join('') +
        '</div>';
      bodyEl.querySelectorAll('.quiz-option').forEach(function (btn) {
        btn.addEventListener('click', function () {
          answers.push(btn.dataset.weight);
          step++;
          if (step < questions.length) renderQuestion();
          else renderResult();
        });
      });
    }

    function renderResult() {
      var key = tally();
      var r = results[key] || { title: 'Thanks!', body: 'Register to get a personalized recommendation.' };
      progressEl.innerHTML = '';
      bodyEl.innerHTML =
        '<div class="quiz-result">' +
        '<p class="quiz-result__title">' + TrivoStudents.esc(r.title) + '</p>' +
        '<p class="quiz-result__body">' + TrivoStudents.esc(r.body) + '</p>' +
        '<a class="btn btn--primary" href="students-form.html?path=' + encodeURIComponent(key) + '">Register now <span aria-hidden="true">→</span></a>' +
        '</div>';
    }

    renderQuestion();
  }

  document.addEventListener('DOMContentLoaded', function () {
    initReveal();
    initFloatingCta();
    if (window.TrivoStudents) {
      TrivoStudents.onReady(function (cfg) {
        TrivoStudents.renderHero(cfg);
        TrivoStudents.renderStats(cfg);
        TrivoStudents.renderOutcomes(cfg);
        TrivoStudents.renderSteps(cfg);
        TrivoStudents.renderCourses(cfg);
        TrivoStudents.renderFaq(cfg);
        TrivoStudents.renderFloatingCta(cfg);
        initQuiz(cfg);
        refreshReveal();
      });
    }
  });
})();

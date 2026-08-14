/* ============================================================
   Thịnh Thế Vinh Hoa — Hành vi trang chủ
   Render các section theo SITE_DATA + nạp dữ liệu động từ API.
   Nguyên tắc: API lỗi hoặc rỗng → ẩn section, không hiện lỗi/JSON.
   ============================================================ */
(function () {
  'use strict';

  var D = window.SITE_DATA || {};
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function $(sel, root) { return (root || document).querySelector(sel); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function arrowSvg() {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('class', 'arrow');
    s.setAttribute('width', '16');
    s.setAttribute('height', '16');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('fill', 'none');
    s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '2');
    s.setAttribute('stroke-linecap', 'round');
    s.setAttribute('stroke-linejoin', 'round');
    s.setAttribute('aria-hidden', 'true');
    var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', 'M5 12h14M13 6l6 6-6 6');
    s.appendChild(p);
    return s;
  }

  /* ---------------- Header: đổi nền khi cuộn ---------------- */
  (function header() {
    var head = $('#site-header');
    if (!head) return;
    var stuck = false;
    function onScroll() {
      var next = window.scrollY > 16;
      if (next !== stuck) {
        stuck = next;
        head.classList.toggle('is-stuck', stuck);
      }
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  })();

  /* ---------------- Menu mobile ---------------- */
  (function mobileNav() {
    var toggle = $('#nav-toggle');
    var panel = $('#mobile-nav');
    var close = $('#mobile-nav-close');
    if (!toggle || !panel) return;

    var lastFocus = null;

    function focusables() {
      return Array.prototype.slice.call(panel.querySelectorAll('a[href], button:not([disabled])'));
    }

    function open() {
      lastFocus = document.activeElement;
      panel.classList.add('is-open');
      toggle.setAttribute('aria-expanded', 'true');
      document.body.style.overflow = 'hidden';
      /* visibility đổi tức thì (xem site.css) nên focus được ngay, không cần chờ frame */
      var first = focusables()[0];
      if (first) first.focus();
    }

    function shut() {
      if (!panel.classList.contains('is-open')) return;
      panel.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    toggle.addEventListener('click', open);
    if (close) close.addEventListener('click', shut);
    panel.addEventListener('click', function (e) {
      if (e.target.closest('a')) shut();
    });

    document.addEventListener('keydown', function (e) {
      if (!panel.classList.contains('is-open')) return;

      if (e.key === 'Escape') { shut(); return; }

      /* giữ tiêu điểm bên trong menu khi đang mở */
      if (e.key === 'Tab') {
        var items = focusables();
        if (!items.length) return;
        var first = items[0];
        var last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  })();

  /* ---------------- Nhận diện: lưới hero + dải logo + footer ----------------
     Cả ba nơi cùng đọc từ SITE_DATA.brands để không lệch nhau. */
  (function brandMarks() {
    var list = D.brands || [];
    if (!list.length) return;

    /* Lưới 2×2 ở hero — "một tập đoàn, nhiều thương hiệu" */
    var visual = $('#hero-visual');
    if (visual) {
      list.forEach(function (b) {
        var tile = el('div', 'hero__brand');
        tile.style.setProperty('--accent', b.accent);
        var img = el('img');
        img.src = b.logo;
        img.alt = '';
        img.loading = 'eager';
        img.decoding = 'async';
        tile.appendChild(img);
        visual.appendChild(tile);
      });
    }

    /* Dải logo trong phần dữ kiện */
    var strip = $('#brand-strip');
    if (strip) {
      list.forEach(function (b) {
        var a = el('a');
        a.href = '#thuong-hieu';
        a.setAttribute('aria-label', 'Xem ' + (b.fullName || b.name));
        var img = el('img');
        img.src = b.logo;
        img.alt = b.fullName || b.name;
        img.loading = 'lazy';
        img.decoding = 'async';
        a.appendChild(img);
        strip.appendChild(a);
      });
    }

    /* Cột thương hiệu ở footer */
    var foot = $('#footer-brands');
    if (foot) {
      list.forEach(function (b) {
        var li = el('li');
        var a = el('a', null, b.fullName || b.name);
        a.href = '#thuong-hieu';
        li.appendChild(a);
        foot.appendChild(li);
      });
    }
  })();

  /* ---------------- Năm bản quyền ---------------- */
  (function year() {
    var y = $('#year');
    if (y) y.textContent = String(new Date().getFullYear());
  })();

  /* ---------------- Dữ kiện doanh nghiệp ---------------- */
  (function facts() {
    var wrap = $('#facts');
    var list = D.facts || [];
    if (!wrap) return;
    if (list.length < 2) { wrap.hidden = true; return; }

    list.forEach(function (f) {
      var item = el('div', 'fact');
      item.appendChild(el('p', 'fact__value', f.value));
      item.appendChild(el('p', 'fact__label', f.label));
      wrap.appendChild(item);
    });
  })();

  /* ---------------- Hệ sinh thái thương hiệu ---------------- */
  (function brands() {
    var wrap = $('#brands');
    var list = D.brands || [];
    if (!wrap) return;
    if (!list.length) { hideSection('#thuong-hieu'); return; }

    list.forEach(function (b, i) {
      var panel = el('article', 'brand-panel reveal' + (i % 2 ? ' brand-panel--flip' : ''));
      panel.style.setProperty('--accent', b.accent);

      var inner = el('div', 'container brand-panel__inner');

      /* cột hình: logo trên nền màu thương hiệu */
      var media = el('div', 'brand-panel__media');
      var logoBox = el('div', 'brand-panel__logo');
      var img = el('img');
      img.src = b.logo;
      img.alt = 'Logo ' + (b.fullName || b.name);
      img.loading = 'lazy';
      img.decoding = 'async';
      logoBox.appendChild(img);
      media.appendChild(logoBox);

      /* cột nội dung */
      var body = el('div', 'brand-panel__body');
      body.appendChild(el('p', 'brand-panel__index', String(i + 1).padStart(2, '0')));

      var h3 = el('h3', 'brand-panel__name', b.name);
      body.appendChild(h3);

      body.appendChild(el('p', 'brand-panel__category', b.category));
      body.appendChild(el('p', 'brand-panel__statement', b.statement));

      var desc = el('p', 'brand-panel__desc', b.description);
      body.appendChild(desc);

      if (b.social && b.social.url) {
        var actions = el('div', 'brand-panel__actions');
        var social = el('a', 'brand-panel__social link-line');
        social.href = b.social.url;
        social.target = '_blank';
        social.rel = 'noopener';
        social.setAttribute('aria-label', b.social.label + ' của ' + (b.fullName || b.name));
        social.appendChild(document.createTextNode(b.social.label));
        social.appendChild(arrowSvg());
        actions.appendChild(social);
        body.appendChild(actions);
      }

      inner.appendChild(media);
      inner.appendChild(body);
      panel.appendChild(inner);
      wrap.appendChild(panel);
    });
  })();

  /* ---------------- Năng lực vận hành ---------------- */
  (function capabilities() {
    var wrap = $('#capabilities');
    var list = D.capabilities || [];
    if (!wrap) return;
    if (!list.length) { hideSection('#nang-luc'); return; }

    list.forEach(function (c, i) {
      var row = el('li', 'capability reveal');
      row.appendChild(el('span', 'capability__num', String(i + 1).padStart(2, '0')));
      row.appendChild(el('h3', 'capability__title', c.title));
      row.appendChild(el('p', 'capability__desc', c.desc));
      wrap.appendChild(row);
    });
  })();

  /* ---------------- Giá trị cốt lõi ---------------- */
  (function values() {
    var wrap = $('#values');
    var list = D.values || [];
    if (!wrap) return;
    if (!list.length) { wrap.hidden = true; return; }

    list.forEach(function (v, i) {
      var li = el('li');
      li.appendChild(el('span', 'value-list__num', String(i + 1).padStart(2, '0')));
      var body = el('div', 'value-list__body');
      body.appendChild(el('h3', null, v.title));
      body.appendChild(el('p', null, v.desc));
      li.appendChild(body);
      wrap.appendChild(li);
    });
  })();

  /* ---------------- Hành trình ---------------- */
  (function journey() {
    var wrap = $('#timeline');
    var list = D.timeline || [];
    if (!wrap) return;
    if (!list.length) { hideSection('#hanh-trinh'); return; }

    list.forEach(function (t) {
      var row = el('li', 'timeline__item reveal');
      row.appendChild(el('p', 'timeline__year', t.year));
      var body = el('div');
      body.appendChild(el('h3', 'timeline__title', t.title));
      if (t.desc) body.appendChild(el('p', 'timeline__desc', t.desc));
      row.appendChild(body);
      wrap.appendChild(row);
    });
  })();

  /* ---------------- Liên hệ ---------------- */
  (function contact() {
    var c = D.contact;
    if (!c) return;

    var map = $('#contact-map');
    if (map && c.mapEmbed) {
      var frame = el('iframe');
      frame.src = c.mapEmbed;
      frame.title = 'Bản đồ trụ sở Thịnh Thế Vinh Hoa';
      frame.loading = 'lazy';
      frame.referrerPolicy = 'no-referrer-when-downgrade';
      map.appendChild(frame);
    }
  })();

  /* ---------------- Khoảnh khắc (gallery) ---------------- */
  (function gallery() {
    var wrap = $('#gallery');
    if (!wrap) return;

    fetch('/api/gallery')
      .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
      .then(function (j) {
        var items = (j && j.items) || [];
        if (!items.length) return Promise.reject();

        items.slice(0, 5).forEach(function (it, i) {
          var fig = el('figure', 'gallery__item reveal');
          var img = el('img');
          img.src = it.src;
          img.alt = it.caption || 'Khoảnh khắc tại Thịnh Thế Vinh Hoa';
          img.loading = i === 0 ? 'eager' : 'lazy';
          img.decoding = 'async';
          fig.appendChild(img);
          if (it.caption) {
            fig.appendChild(el('figcaption', 'gallery__caption', it.caption));
          }
          wrap.appendChild(fig);
        });
        observeReveals(wrap);
      })
      .catch(function () { hideSection('#hinh-anh'); });
  })();

  /* ---------------- Tin tức ---------------- */
  (function news() {
    var lead = $('#news-lead');
    var rest = $('#news-rest');
    var navLinks = document.querySelectorAll('[data-nav="tin-tuc"]');
    if (!lead || !rest) return;

    function hideNews() {
      hideSection('#tin-tuc');
      navLinks.forEach(function (a) {
        var li = a.closest('li');
        (li || a).hidden = true;
      });
    }

    function fmtDate(v) {
      var d = new Date(v);
      return isNaN(d) ? '' : d.toLocaleDateString('vi-VN');
    }

    function card(p, small) {
      var a = el('a', 'article' + (small ? ' article--sm' : '') + ' reveal');
      a.href = '/tin-tuc/' + encodeURIComponent(p.id);
      a.addEventListener('click', function (e) { e.preventDefault(); openArticle(p); });

      if (p.image) {
        var media = el('div', 'article__media');
        var img = el('img');
        img.src = p.image;
        img.alt = '';
        img.loading = 'lazy';
        img.decoding = 'async';
        media.appendChild(img);
        a.appendChild(media);
      }

      var meta = el('div', 'article__meta');
      meta.appendChild(el('span', null, 'Tin tức'));
      var dt = fmtDate(p.createdAt);
      if (dt) meta.appendChild(el('span', null, dt));
      a.appendChild(meta);

      a.appendChild(el('h3', 'article__title', p.title));
      if (p.body) a.appendChild(el('p', 'article__excerpt', p.body));
      return a;
    }

    /* modal đọc bài */
    var modal = $('#article-modal');
    function openArticle(p) {
      if (!modal) return;
      $('#article-modal-title', modal).textContent = p.title;
      $('#article-modal-date', modal).textContent = fmtDate(p.createdAt);
      $('#article-modal-body', modal).textContent = p.body || '';
      var img = $('#article-modal-img', modal);
      if (p.image) { img.src = p.image; img.hidden = false; }
      else { img.hidden = true; }
      modal.showModal();
    }
    if (modal) {
      $('#article-modal-close', modal).addEventListener('click', function () { modal.close(); });
      modal.addEventListener('click', function (e) { if (e.target === modal) modal.close(); });
    }

    fetch('/api/posts')
      .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
      .then(function (j) {
        var posts = (j && j.posts) || [];
        if (!posts.length) return Promise.reject();

        lead.appendChild(card(posts[0], false));
        posts.slice(1, 3).forEach(function (p) { rest.appendChild(card(p, true)); });
        observeReveals(lead);
        observeReveals(rest);
      })
      .catch(hideNews);
  })();

  /* ---------------- Reveal khi cuộn ---------------- */
  var io = null;
  function observeReveals(root) {
    var nodes = (root || document).querySelectorAll('.reveal:not(.is-visible)');
    if (reduceMotion || !('IntersectionObserver' in window)) {
      nodes.forEach(function (n) { n.classList.add('is-visible'); });
      return;
    }
    if (!io) {
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            e.target.classList.add('is-visible');
            io.unobserve(e.target);
          }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    }
    nodes.forEach(function (n) { io.observe(n); });
  }
  observeReveals(document);

  /* ---------------- Tiện ích ---------------- */
  function hideSection(sel) {
    var s = $(sel);
    if (s) s.hidden = true;
  }

  /* Parallax rất nhẹ cho khối ảnh hero (chỉ desktop, tôn trọng reduced-motion) */
  (function heroParallax() {
    var visual = $('#hero-visual');
    if (!visual || reduceMotion || window.innerWidth < 900) return;

    var ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        var y = Math.min(window.scrollY, 600);
        visual.style.transform = 'translate3d(0,' + (y * -0.03).toFixed(2) + 'px,0)';
        ticking = false;
      });
    }, { passive: true });
  })();
})();

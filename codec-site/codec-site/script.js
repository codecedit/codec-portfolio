(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const remPx = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 10;
  const docTop = (el) => el.getBoundingClientRect().top + window.scrollY;

  /* ------------------------------------------------------------
     1. Nav: highlight the pill for the section you're in
  ------------------------------------------------------------ */
  const navLinks = $$('.nav a');
  const sections = { top: $('#top'), work: $('#work-h'), contact: $('#contact') };

  function updateNav() {
    const probe = window.scrollY + window.innerHeight * 0.4;
    const atBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4;
    let current = 'top';
    if (probe >= docTop(sections.work) - window.innerHeight * 0.3) current = 'work';
    if (atBottom || probe >= docTop(sections.contact)) current = 'contact';
    navLinks.forEach((a) => a.classList.toggle('is-active', a.dataset.spy === current));
  }

  /* ------------------------------------------------------------
     2. Jog wheel: drag to spin, with momentum.
        The timecode under it scrubs along (one full turn = 1 second).
  ------------------------------------------------------------ */
  (function jog() {
    const cell = $('#jog-cell');
    const star = $('#jog');
    const tc = $('#jog-tc');
    if (!cell || !star) return;

    let rotation = 0;
    let velocity = 0;
    let dragging = false;
    let lastAngle = 0;
    let lastTime = 0;
    let frame = 0;

    const centre = () => {
      const r = star.getBoundingClientRect();
      return [r.left + r.width / 2, r.top + r.height / 2];
    };
    const angleAt = (e) => {
      const [cx, cy] = centre();
      return (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI;
    };
    const two = (n) => String(Math.floor(n)).padStart(2, '0');
    const render = () => {
      star.style.transform = `rotate(${rotation}deg)`;
      if (tc) {
        const frames = Math.max(0, Math.round((rotation / 360) * 30));
        const secs = Math.floor(frames / 30);
        tc.textContent = `${two(secs / 3600)}:${two((secs / 60) % 60)}:${two(secs % 60)}:${two(frames % 30)}`;
      }
    };

    cell.addEventListener('pointerdown', (e) => {
      dragging = true;
      cancelAnimationFrame(frame);
      cell.setPointerCapture(e.pointerId);
      cell.classList.add('is-dragging');
      lastAngle = angleAt(e);
      lastTime = performance.now();
      velocity = 0;
      e.preventDefault();
    });

    cell.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const angle = angleAt(e);
      let delta = angle - lastAngle;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      const now = performance.now();
      const dt = Math.max(now - lastTime, 1);
      velocity = velocity * 0.6 + ((delta / dt) * 16) * 0.4; // degrees per frame
      rotation += delta;
      lastAngle = angle;
      lastTime = now;
      render();
    });

    const release = () => {
      if (!dragging) return;
      dragging = false;
      cell.classList.remove('is-dragging');
      if (reduceMotion) return;
      const spin = () => {
        rotation += velocity;
        velocity *= 0.95;
        render();
        if (Math.abs(velocity) > 0.05) frame = requestAnimationFrame(spin);
      };
      frame = requestAnimationFrame(spin);
    };
    cell.addEventListener('pointerup', release);
    cell.addEventListener('pointercancel', release);
  })();

  /* ------------------------------------------------------------
     3. Videos: muted + looping, play only while on screen,
        visitor unmutes with the button. One video has sound at a time.
        Card attributes:  data-src="videos/xx.mp4"   (self-hosted file)
                          data-yt="VIDEO_ID"         (YouTube embed)
  ------------------------------------------------------------ */
  (function videos() {
    const players = new Map();

    const ytCommand = (frame, func, args = []) => {
      if (frame.contentWindow) {
        frame.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
      }
    };

    function makeButton(thumb) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'snd';
      btn.dataset.state = 'off';
      btn.setAttribute('aria-label', 'Unmute ' + (($('.title', thumb.closest('.card')) || {}).textContent || 'video'));
      btn.innerHTML =
        '<svg class="off" aria-hidden="true"><use href="#i-snd-off"/></svg>' +
        '<svg class="on" aria-hidden="true"><use href="#i-snd-on"/></svg>' +
        '<span class="snd-label">unmute</span>';
      thumb.appendChild(btn);
      return btn;
    }

    function paintButton(p) {
      p.btn.dataset.state = p.muted ? 'off' : 'on';
      const name = ($('.title', p.btn.closest('.card')) || {}).textContent || 'video';
      p.btn.setAttribute('aria-label', (p.muted ? 'Unmute ' : 'Mute ') + name);
      $('.snd-label', p.btn).textContent = p.muted ? 'unmute' : 'mute';
    }

    function setSound(card, on) {
      const p = players.get(card);
      if (!p) return;
      if (on) players.forEach((other, c) => { if (c !== card && !other.muted) setSound(c, false); });
      p.muted = !on;
      if (p.type === 'file') {
        p.el.muted = !on;
        if (on) { p.el.volume = 1; p.el.play().catch(() => {}); }
      } else {
        ytCommand(p.el, on ? 'unMute' : 'mute');
        if (on) { ytCommand(p.el, 'setVolume', [100]); ytCommand(p.el, 'playVideo'); }
      }
      paintButton(p);
    }

    function mount(card) {
      if (players.has(card)) return players.get(card);
      const thumb = $('.thumb', card);
      const poster = $('.poster', card);
      const file = (card.dataset.src || '').trim();
      const ytId = (card.dataset.yt || '').trim();
      let p = null;

      if (ytId) {
        const f = document.createElement('iframe');
        f.className = 'yt';
        f.title = $('.title', card).textContent;
        f.allow = 'autoplay; encrypted-media; picture-in-picture';
        // YouTube refuses to play (Error 153) when the embedding page sends no referrer.
        // This always works on a hosted https:// site; it can NOT work from a file:// page
        // (double-clicking index.html), because file pages have no origin to send.
        f.referrerPolicy = 'strict-origin-when-cross-origin';
        f.setAttribute('tabindex', '-1');
        const origin = /^https?:$/.test(location.protocol)
          ? '&origin=' + encodeURIComponent(location.origin) : '';
        f.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(ytId) +
          '?autoplay=1&mute=1&loop=1&playlist=' + encodeURIComponent(ytId) +
          '&controls=0&modestbranding=1&playsinline=1&rel=0&iv_load_policy=3&cc_load_policy=0&disablekb=1&fs=0&enablejsapi=1' + origin;
        thumb.insertBefore(f, poster.nextSibling);
        p = { type: 'yt', el: f, muted: true, visible: true, ready: false };
        f.addEventListener('load', () => {
          p.ready = true;
          f.classList.add('is-on');
          if (!p.visible) ytCommand(f, 'pauseVideo');
        });
      } else if (file) {
        const v = document.createElement('video');
        v.className = 'vid';
        v.muted = true;
        v.loop = true;
        v.playsInline = true;
        v.preload = 'metadata';
        v.setAttribute('muted', '');
        v.setAttribute('playsinline', '');
        v.poster = poster.currentSrc || poster.src;
        v.src = file;
        v.addEventListener('playing', () => v.classList.add('is-on'));
        v.addEventListener('error', () => {   // file missing: fall back to the poster image
          v.remove();
          const q = players.get(card);
          if (q) { q.btn.remove(); players.delete(card); }
        }, { once: true });
        thumb.insertBefore(v, poster.nextSibling);
        p = { type: 'file', el: v, muted: true, visible: true };
      }

      if (!p) return null;
      p.btn = makeButton(thumb);
      p.btn.addEventListener('click', (e) => {
        e.stopPropagation();
        setSound(card, p.muted);
      });
      players.set(card, p);
      return p;
    }

    // While a YouTube video is paused, YouTube draws its own buttons over it,
    // so we fade back to the poster image and fade the video in again on play.
    const play = (p) => {
      if (p.type === 'file') p.el.play().catch(() => {});
      else if (p.ready) { ytCommand(p.el, 'playVideo'); p.el.classList.add('is-on'); }
    };
    const pause = (p) => {
      if (p.type === 'file') p.el.pause();
      else if (p.ready) { p.el.classList.remove('is-on'); ytCommand(p.el, 'pauseVideo'); }
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const card = entry.target;
        if (entry.isIntersecting) {
          const p = mount(card);
          if (p) { p.visible = true; play(p); }
        } else {
          const p = players.get(card);
          if (p) { p.visible = false; pause(p); }
        }
      });
    }, { threshold: 0.35 });

    $$('.card').forEach((card) => {
      if ((card.dataset.src || '').trim() || (card.dataset.yt || '').trim()) observer.observe(card);
    });
  })();

  /* ------------------------------------------------------------
     4. Timecode ruler + playhead that follows your scroll
        1 second = 4rem (40 design px), a label every 5 seconds
  ------------------------------------------------------------ */
  const ruler = $('.ruler');
  const ph = ruler && $('.playhead', ruler);
  const phTag = ruler && $('.ph-tag', ruler);

  const pad = (n) => String(Math.floor(n)).padStart(2, '0');
  const clock = (s) => `${pad(s / 60)}:${pad(s % 60)}`;

  function buildRuler() {
    if (!ruler || getComputedStyle(ruler).display === 'none') return;
    const labels = $('.ruler-labels', ruler);
    labels.textContent = '';
    const heightRem = ruler.getBoundingClientRect().height / remPx();
    for (let y = 0; y <= heightRem; y += 20) {
      const span = document.createElement('span');
      span.style.top = y + 'rem';
      span.textContent = clock(y / 4);
      labels.appendChild(span);
    }
  }

  function updateRuler() {
    if (!ruler || getComputedStyle(ruler).display === 'none') return;
    const r = ruler.getBoundingClientRect();
    const y = Math.min(Math.max(window.innerHeight * 0.4 - r.top, 0), r.height);
    ph.style.transform = `translateY(${y}px)`;
    const seconds = y / remPx() / 4;
    phTag.textContent = `${clock(seconds)}:${pad((seconds % 1) * 30)}`; // mm:ss:ff at 30fps
  }

  if (ruler) {
    ruler.addEventListener('click', (e) => {
      const r = ruler.getBoundingClientRect();
      window.scrollTo({
        top: window.scrollY + r.top + (e.clientY - r.top) - window.innerHeight * 0.4,
        behavior: reduceMotion ? 'auto' : 'smooth',
      });
    });
  }

  /* ------------------------------------------------------------
     5. Copy buttons (Discord handle, email address)
  ------------------------------------------------------------ */
  $$('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const label = $('.copy-label', btn);
      const original = btn.dataset.copy;
      try {
        await navigator.clipboard.writeText(original);
      } catch (_) {
        const ta = document.createElement('textarea');
        ta.value = original;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (__) { /* ignore */ }
        ta.remove();
      }
      const idle = label.dataset.idle || original;
      label.textContent = 'copied!';
      setTimeout(() => { label.textContent = idle; }, 1400);
    });
  });

  /* ------------------------------------------------------------
     6. Email links
     A plain mailto: link does nothing on a computer with no mail app set
     up (it often just opens a blank browser tab). On computers we open a
     Gmail compose window in a new tab instead. Phones keep mailto: so the
     native mail app opens. The mailto: link stays as the fallback.
  ------------------------------------------------------------ */
  const isTouch = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  $$('a[href^="mailto:"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      if (isTouch || e.defaultPrevented || e.button !== 0 ||
          e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      let to, subject, body;
      try {
        const u = new URL(a.href);
        to = decodeURIComponent(u.pathname);
        subject = u.searchParams.get('subject') || '';
        body = u.searchParams.get('body') || '';
      } catch (_) { return; }
      const gmail = 'https://mail.google.com/mail/?view=cm&fs=1' +
        '&to=' + encodeURIComponent(to) +
        '&su=' + encodeURIComponent(subject) +
        '&body=' + encodeURIComponent(body);
      const w = window.open(gmail, '_blank');
      if (w) { w.opener = null; e.preventDefault(); }   // popup blocked: fall back to mailto:
    });
  });

  /* ------------------------------------------------------------
     scroll / resize plumbing
  ------------------------------------------------------------ */
  let queued = false;
  const onScroll = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; updateNav(); updateRuler(); });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', () => { buildRuler(); onScroll(); });
  window.addEventListener('load', () => { buildRuler(); updateNav(); updateRuler(); });
  buildRuler();
  updateNav();
  updateRuler();
})();

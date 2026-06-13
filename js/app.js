/* =========================================================================
   CASILLAS NEUQUÉN — app.js
   Vanilla JS. Patrón de diseño principal: STRATEGY (validación de formulario).
   Complemento: IntersectionObserver (Observer nativo) para animaciones.
   -------------------------------------------------------------------------
   Estructura:
     1. Utilidades
     2. STRATEGY: estrategias de validación + validador de formulario
     3. Formulario de contacto -> arma mensaje de WhatsApp (CTA real)
     4. Carrusel de modelos
     5. Lightbox (zoom + arrastre + navegación entre modelos)
     6. Header con estado de scroll + nav activo
     7. Navegación mobile (toggle + dropdowns acordeón)
     8. IntersectionObserver para .reveal
     9. Año del footer + init
   ========================================================================= */
(function () {
  'use strict';

  /* ----------------------------------------------------------------------
     1. UTILIDADES
  ---------------------------------------------------------------------- */
  const $  = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from((ctx || document).querySelectorAll(sel));
  const WA_NUMBER = '5492996127677';
  const prefersReduced =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ----------------------------------------------------------------------
     2. STRATEGY PATTERN — VALIDACIÓN
     Cada regla es una "estrategia" intercambiable con la firma:
        (value, param) => true | "mensaje de error"
     El campo declara sus reglas en data-validate="required minLength:3".
     Para sumar una regla nueva alcanza con agregar una entrada acá:
     NO hay que tocar el validador. (Open/Closed Principle)
  ---------------------------------------------------------------------- */
  const ValidationStrategies = {
    required(value) {
      return value.trim().length > 0 || 'Este campo es obligatorio.';
    },
    minLength(value, n) {
      const min = parseInt(n, 10) || 0;
      return value.trim().length >= min || `Debe tener al menos ${min} caracteres.`;
    },
    phone(value) {
      const digits = value.replace(/[\s()+.\-]/g, '');
      if (digits.length === 0) return 'Ingresá un número de contacto.';
      return /^\d{8,15}$/.test(digits) || 'Ingresá un número válido (solo dígitos, 8 a 15).';
    },
    email(value) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) || 'Ingresá un email válido.';
    },
    // Email tolerante: válido si está vacío; si hay algo, debe tener formato correcto.
    emailOptional(value) {
      if (value.trim() === '') return true;
      return ValidationStrategies.email(value);
    },
    // Marcador explícito para campos sin reglas.
    optional() {
      return true;
    }
  };

  /**
   * Validador genérico que aplica las estrategias declaradas por cada campo.
   * No conoce ninguna regla concreta: las resuelve por nombre desde el mapa.
   */
  const FormValidator = {
    parseRules(field) {
      const raw = (field.getAttribute('data-validate') || '').trim();
      if (!raw) return [];
      return raw.split(/\s+/).map(token => {
        const [name, param] = token.split(':');
        return { name, param };
      });
    },

    // Devuelve el primer mensaje de error encontrado, o null si pasa.
    validateField(field) {
      const rules = this.parseRules(field);
      const value = field.value || '';
      for (const { name, param } of rules) {
        const strategy = ValidationStrategies[name];
        if (typeof strategy !== 'function') continue; // regla desconocida -> se ignora
        const result = strategy(value, param);
        if (result !== true) return result; // string = error
      }
      return null;
    },

    // Aplica estado visual + mensaje en el campo.
    applyState(field, errorMsg) {
      const wrap = field.closest('.field');
      const slot = wrap ? $('[data-error-for="' + field.id + '"]', wrap) : null;
      if (!wrap) return;
      wrap.classList.remove('invalid', 'valid');
      const hasRules = this.parseRules(field).some(r => r.name !== 'optional');
      if (errorMsg) {
        wrap.classList.add('invalid');
        if (slot) slot.textContent = errorMsg;
        field.setAttribute('aria-invalid', 'true');
      } else {
        if (slot) slot.textContent = '';
        field.removeAttribute('aria-invalid');
        // Solo marcamos "valid" si el campo tenía reglas y trae contenido.
        if (hasRules && (field.value || '').trim() !== '') wrap.classList.add('valid');
      }
    },

    // Valida todos los campos del form; devuelve true si todos pasan.
    validateForm(form) {
      const fields = $$('[data-validate]', form);
      let firstInvalid = null;
      let ok = true;
      fields.forEach(field => {
        const err = this.validateField(field);
        this.applyState(field, err);
        if (err) {
          ok = false;
          if (!firstInvalid) firstInvalid = field;
        }
      });
      if (firstInvalid) firstInvalid.focus();
      return ok;
    }
  };

  /* ----------------------------------------------------------------------
     3. FORMULARIO DE CONTACTO -> WHATSAPP (CTA principal genuino)
  ---------------------------------------------------------------------- */
  function initContactForm() {
    const form = $('#contactForm');
    if (!form) return;
    const note = $('[data-form-note]', form);
    const fields = $$('[data-validate]', form);

    // Validación en vivo: al salir del campo y al corregir.
    fields.forEach(field => {
      const evt = field.tagName === 'SELECT' ? 'change' : 'blur';
      field.addEventListener(evt, () => {
        FormValidator.applyState(field, FormValidator.validateField(field));
      });
      field.addEventListener('input', () => {
        const wrap = field.closest('.field');
        if (wrap && wrap.classList.contains('invalid')) {
          FormValidator.applyState(field, FormValidator.validateField(field));
        }
      });
    });

    form.addEventListener('submit', e => {
      e.preventDefault();
      if (note) { note.textContent = ''; note.classList.remove('ok', 'err'); }

      if (!FormValidator.validateForm(form)) {
        if (note) {
          note.textContent = 'Revisá los campos marcados para continuar.';
          note.classList.add('err');
        }
        return;
      }

      // Datos validados -> armamos el mensaje de WhatsApp.
      const data = Object.fromEntries(new FormData(form).entries());
      const lines = [
        '¡Hola Casillas Neuquén! Quiero hacer una consulta:',
        '',
        `• Nombre: ${data.nombre || ''}`,
        `• WhatsApp: ${data.whatsapp || ''}`,
        data.email ? `• Email: ${data.email}` : null,
        `• Modelo de interés: ${data.modelo || ''}`,
        data.mensaje ? `• Mensaje: ${data.mensaje}` : null
      ].filter(Boolean);

      const url = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(lines.join('\n'))}`;

      if (note) {
        note.textContent = '¡Listo! Te estamos abriendo WhatsApp para enviar tu consulta.';
        note.classList.add('ok');
      }

      // Medición opcional para Google Ads/Analytics (si gtag está cargado).
      if (typeof window.gtag === 'function') {
        try { window.gtag('event', 'generate_lead', { method: 'whatsapp_form' }); } catch (_) {}
      }

      // Registramos el lead en Netlify Forms (no bloquea el flujo a WhatsApp).
      try {
        const body = new URLSearchParams();
        body.append('form-name', 'contact');
        Object.entries(data).forEach(([k, v]) => body.append(k, v));
        fetch('/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString()
        }).catch(() => {});
      } catch (_) {}

      form.reset();
      $$('.field', form).forEach(w => w.classList.remove('valid', 'invalid'));
      // Navegación en la MISMA pestaña: no abrimos ventanas nuevas.
      // En celular esto abre la app de WhatsApp; el navegador queda detrás.
      window.location.href = url;
    });
  }

  /* ----------------------------------------------------------------------
     4. CARRUSEL DE MODELOS
  ---------------------------------------------------------------------- */
  function initCarousel() {
    $$('[data-carousel]').forEach(setupCarousel);
  }

  function setupCarousel(root) {
    const track  = $('[data-track]', root);
    const slides = $$('.model-card', track);
    const prev   = $('[data-dir="-1"]', root);
    const next   = $('[data-dir="1"]', root);
    const dotsWrap = $('[data-dots]', root);
    if (!track || slides.length === 0) return;

    let index = 0;

    const perView = () => {
      const w = window.innerWidth;
      if (w >= 1024) return 3;
      if (w >= 680)  return 2;
      return 1;
    };

    const maxIndex = () => Math.max(0, slides.length - perView());

    function buildDots() {
      if (!dotsWrap) return;
      dotsWrap.innerHTML = '';
      const pages = maxIndex() + 1;
      for (let i = 0; i < pages; i++) {
        const b = document.createElement('button');
        b.className = 'carousel-dot';
        b.type = 'button';
        b.setAttribute('aria-label', `Ir al modelo ${i + 1}`);
        b.addEventListener('click', () => { index = i; update(); });
        dotsWrap.appendChild(b);
      }
    }

    function update() {
      index = Math.min(index, maxIndex());
      index = Math.max(0, index);
      const slide = slides[0];
      const style = getComputedStyle(track);
      const gap = parseFloat(style.columnGap || style.gap || '0') || 0;
      const step = slide.getBoundingClientRect().width + gap;
      track.style.transform = `translate3d(${-index * step}px,0,0)`;

      if (dotsWrap) {
        $$('.carousel-dot', dotsWrap).forEach((d, i) =>
          d.classList.toggle('is-active', i === index));
      }
      if (prev) prev.disabled = index <= 0;
      if (next) next.disabled = index >= maxIndex();
    }

    if (prev) prev.addEventListener('click', () => { index--; update(); });
    if (next) next.addEventListener('click', () => { index++; update(); });

    // Teclado cuando el carrusel tiene foco.
    root.setAttribute('tabindex', '0');
    root.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft')  { index--; update(); }
      if (e.key === 'ArrowRight') { index++; update(); }
    });

    // Swipe táctil.
    let startX = 0, dragging = false;
    track.addEventListener('touchstart', e => {
      startX = e.touches[0].clientX; dragging = true;
    }, { passive: true });
    track.addEventListener('touchend', e => {
      if (!dragging) return;
      dragging = false;
      const dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 40) { index += dx < 0 ? 1 : -1; update(); }
    }, { passive: true });

    let resizeT;
    window.addEventListener('resize', () => {
      clearTimeout(resizeT);
      resizeT = setTimeout(() => { buildDots(); update(); }, 150);
    });

    buildDots();
    update();
  }

  /* ----------------------------------------------------------------------
     5. LIGHTBOX — abre el poster del modelo, navega, hace zoom y arrastre
  ---------------------------------------------------------------------- */
  function initLightbox() {
    const lb = $('#lightbox');
    if (!lb) return;
    const img     = $('[data-lb-img]', lb);
    const caption = $('[data-lb-caption]', lb);
    const stage   = $('[data-lb-stage]', lb);
    const btnPrev = $('[data-lb-prev]', lb);
    const btnNext = $('[data-lb-next]', lb);
    const btnClose= $('[data-lb-close]', lb);

    // La colección activa se arma según la galería del poster abierto.
    let items = [];
    let current = 0;

    function mapPoster(p) {
      const card = p.closest('.model-card');
      const waLink = card ? card.querySelector('a[href*="wa.me"]') : null;
      const nameEl = card ? card.querySelector('.model-name') : null;
      return {
        src: p.getAttribute('data-img'),
        title: p.getAttribute('data-title') || '',
        name: (nameEl ? nameEl.textContent : 'esto').trim(),
        wa: waLink ? waLink.getAttribute('href')
          : `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent('Hola Casillas Neuquén, me interesa este producto')}`
      };
    }

    // Estado de zoom/pan.
    let zoomed = false, panX = 0, panY = 0;
    let dragging = false, lastX = 0, lastY = 0;

    function resetZoom() {
      zoomed = false; panX = 0; panY = 0;
      stage.classList.remove('zoomed', 'grabbing');
      img.style.transform = 'translate(0,0) scale(1)';
      img.style.opacity = '1';
    }

    function render() {
      const item = items[current];
      if (!item) return;
      img.src = item.src;
      img.alt = item.title;
      if (caption) caption.textContent = item.title;
      resetZoom();
    }

    function open(i) {
      current = (i + items.length) % items.length;
      render();
      lb.classList.add('open');
      lb.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      btnClose && btnClose.focus();
    }
    function close() {
      lb.classList.remove('open');
      lb.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      resetZoom();
      const m = lb.querySelector('.lb-match');
      if (m) m.remove();
    }
    function go(delta) { current = (current + delta + items.length) % items.length; render(); }

    // Disparadores: botón "Ver al detalle" y click en el poster.
    $$('.model-poster[data-img]').forEach(poster => {
      const openFromPoster = () => {
        const imgsAttr = poster.getAttribute('data-images');
        if (imgsAttr) {
          // MODELO: la galería son las fotos de ESA casilla.
          const card = poster.closest('.model-card');
          const waLink = card ? card.querySelector('a[href*="wa.me"]') : null;
          const nameEl = card ? card.querySelector('.model-name') : null;
          const name = (nameEl ? nameEl.textContent : 'esta casilla').trim();
          const title = poster.getAttribute('data-title') || '';
          const wa = waLink ? waLink.getAttribute('href')
            : `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent('Hola Casillas Neuquén, me interesa este modelo')}`;
          const srcs = imgsAttr.split(',').map(s => s.trim()).filter(Boolean);
          items = srcs.map(src => ({ src, title, name, wa }));
          open(0);
        } else {
          // ACCESORIOS: se navega entre los accesorios de la galería.
          const gallery = poster.closest('[data-gallery]');
          const group = gallery ? $$('.model-poster[data-img]', gallery) : [poster];
          items = group.map(mapPoster);
          const idx = group.indexOf(poster);
          open(idx < 0 ? 0 : idx);
        }
      };
      const btn = $('[data-open-detail]', poster);
      if (btn) btn.addEventListener('click', e => { e.preventDefault(); openFromPoster(); });
      poster.addEventListener('click', e => {
        if (e.target.closest('[data-open-detail]')) return; // ya manejado
        openFromPoster();
      });
    });

    btnPrev && btnPrev.addEventListener('click', () => go(-1));
    btnNext && btnNext.addEventListener('click', () => go(1));
    btnClose && btnClose.addEventListener('click', close);

    // Click fuera de la imagen cierra; click en la imagen alterna zoom.
    lb.addEventListener('click', e => {
      if (e.target === lb) close();
    });

    // Zoom al hacer click en la imagen.
    img.addEventListener('click', e => {
      e.stopPropagation();
      if (prefersReduced) return;
      zoomed = !zoomed;
      if (zoomed) {
        stage.classList.add('zoomed');
        img.style.transform = 'translate(0,0) scale(2)';
      } else {
        resetZoom();
      }
    });

    // Arrastre cuando está en zoom.
    stage.addEventListener('mousedown', e => {
      if (!zoomed) return;
      dragging = true; lastX = e.clientX; lastY = e.clientY;
      stage.classList.add('grabbing');
      e.preventDefault();
    });
    window.addEventListener('mousemove', e => {
      if (!dragging) return;
      panX += e.clientX - lastX; panY += e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      img.style.transform = `translate(${panX}px,${panY}px) scale(2)`;
    });
    window.addEventListener('mouseup', () => {
      dragging = false; stage.classList.remove('grabbing');
    });

    // Arrastre táctil con un dedo en zoom.
    stage.addEventListener('touchmove', e => {
      if (!zoomed || e.touches.length !== 1) return;
      const t = e.touches[0];
      if (lastX || lastY) { panX += t.clientX - lastX; panY += t.clientY - lastY; }
      lastX = t.clientX; lastY = t.clientY;
      img.style.transform = `translate(${panX}px,${panY}px) scale(2)`;
    }, { passive: true });
    stage.addEventListener('touchend', () => { lastX = 0; lastY = 0; });

    // Swipe tipo Tinder para cambiar de casilla (cuando NO está en zoom).
    let swStartX = 0, swStartY = 0, swiping = false;
    stage.addEventListener('touchstart', e => {
      if (zoomed || e.touches.length !== 1) return;
      swStartX = e.touches[0].clientX;
      swStartY = e.touches[0].clientY;
      swiping = true;
      img.style.transition = 'none';
    }, { passive: true });
    stage.addEventListener('touchmove', e => {
      if (!swiping || zoomed || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - swStartX;
      const dy = e.touches[0].clientY - swStartY;
      if (Math.abs(dx) > Math.abs(dy)) {
        img.style.transform = `translateX(${dx}px) rotate(${dx * 0.04}deg)`;
        img.style.opacity = String(Math.max(0.4, 1 - Math.abs(dx) / 500));
      }
    }, { passive: true });
    // Animación de "match" y redirección a WhatsApp.
    function triggerMatch() {
      const item = items[current];
      const overlay = document.createElement('div');
      overlay.className = 'lb-match';
      overlay.innerHTML =
        '<div class="lb-match-inner">' +
          '<div class="lb-match-heart">♥</div>' +
          '<h3>¡Es un match!</h3>' +
          '<p>Te encantó la <strong>' + item.name + '</strong></p>' +
          '<span class="lb-match-go">Abriendo WhatsApp…</span>' +
        '</div>';
      lb.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add('show'));

      if (typeof window.gtag === 'function') {
        try { window.gtag('event', 'generate_lead', { method: 'tinder_match' }); } catch (_) {}
      }

      // Marcamos que tras el match el usuario debe volver al catálogo de modelos.
      const goToCatalog = () => {
        const models = document.getElementById('modelos');
        close();
        if (models) models.scrollIntoView({ behavior: 'auto', block: 'start' });
      };

      setTimeout(() => {
        // Dejamos la página posicionada en el catálogo y abrimos WhatsApp.
        goToCatalog();
        sessionStorage.setItem('cn_back_to_models', '1');
        window.location.href = item.wa;
      }, 1300);
    }

    // Al regresar desde WhatsApp, volvemos al catálogo de modelos.
    const restoreToCatalog = () => {
      if (sessionStorage.getItem('cn_back_to_models') === '1') {
        sessionStorage.removeItem('cn_back_to_models');
        close();
        const models = document.getElementById('modelos');
        if (models) models.scrollIntoView({ behavior: 'auto', block: 'start' });
      }
    };
    window.addEventListener('pageshow', restoreToCatalog);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') restoreToCatalog();
    });

    stage.addEventListener('touchend', e => {
      if (!swiping || zoomed) { swiping = false; return; }
      swiping = false;
      const dx = e.changedTouches[0].clientX - swStartX;
      img.style.transition = 'transform .3s var(--ease,ease), opacity .3s';
      if (dx > 70) {
        // SWIPE DERECHA = match -> sale la tarjeta y aparece la animación
        img.style.transform = 'translateX(130%) rotate(12deg)';
        img.style.opacity = '0';
        triggerMatch();
      } else if (dx < -70) {
        // SWIPE IZQUIERDA = siguiente casilla
        img.style.transform = 'translateX(-120%) rotate(-8deg)';
        img.style.opacity = '0';
        setTimeout(() => {
          go(1);
          img.style.transition = 'none';
          img.style.transform = 'translateX(120%)';
          img.style.opacity = '0';
          requestAnimationFrame(() => {
            img.style.transition = 'transform .3s var(--ease,ease), opacity .3s';
            img.style.transform = 'translateX(0)';
            img.style.opacity = '1';
          });
        }, 220);
      } else {
        img.style.transform = 'translateX(0)';
        img.style.opacity = '1';
      }
    });

    // Teclado.
    document.addEventListener('keydown', e => {
      if (!lb.classList.contains('open')) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    });
  }

  /* ----------------------------------------------------------------------
     6. HEADER: estado de scroll + nav activo por sección
  ---------------------------------------------------------------------- */
  function initHeader() {
    const header = $('.site-header');
    if (!header) return;

    const onScroll = () => {
      header.classList.toggle('scrolled', window.scrollY > 8);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    // Nav activo: marcamos el enlace de la sección que está bajo el header.
    const links = $$('.nav-link[href^="#"]');
    const sections = links
      .map(link => {
        const id = link.getAttribute('href').slice(1);
        const sec = id && document.getElementById(id);
        return sec ? { link, sec } : null;
      })
      .filter(Boolean);
    if (sections.length === 0) return;

    const setActive = activeLink => {
      links.forEach(l => l.classList.toggle('is-active', l === activeLink));
    };

    const updateActiveNav = () => {
      const y = window.scrollY;
      // Si estamos arriba de todo -> Inicio.
      if (y < 120) { setActive(links[0]); return; }
      // Secciones reales (excluimos el header sticky #top, que falsea posiciones).
      const ordered = sections
        .filter(s => s.sec !== header && s.sec.id !== 'top')
        .map(s => ({ link: s.link, top: s.sec.getBoundingClientRect().top + y }))
        .sort((a, b) => a.top - b.top);
      if (ordered.length === 0) { setActive(links[0]); return; }
      // Si llegamos al final -> última sección por posición real.
      if (window.innerHeight + y >= document.body.offsetHeight - 4) {
        setActive(ordered[ordered.length - 1].link);
        return;
      }
      // Referencia justo debajo del header (alto del header + margen).
      const line = y + 100;
      let current = links[0]; // por defecto, Inicio
      ordered.forEach(({ link, top }) => {
        if (top <= line) current = link;
      });
      setActive(current);
    };

    updateActiveNav();
    window.addEventListener('scroll', updateActiveNav, { passive: true });

    // Al hacer clic en el logo (o cualquier enlace a #top), volvemos al inicio.
    $$('a[href="#top"]').forEach(a => {
      a.addEventListener('click', e => {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: prefersReduced ? 'auto' : 'smooth' });
        setActive(links[0]);
        if (history.replaceState) history.replaceState(null, '', location.pathname + location.search);
      });
    });
  }

  /* ----------------------------------------------------------------------
     7. NAVEGACIÓN MOBILE: toggle + dropdowns acordeón
  ---------------------------------------------------------------------- */
  function initMobileNav() {
    const toggle = $('.nav-toggle');
    const nav = $('#primary-nav');
    if (!toggle || !nav) return;

    const setOpen = open => {
      nav.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
    };

    toggle.addEventListener('click', () => setOpen(!nav.classList.contains('open')));

    // Dropdowns como acordeón en mobile.
    $$('.has-dropdown', nav).forEach(item => {
      const trigger = $('.nav-link', item);
      if (!trigger) return;
      trigger.addEventListener('click', e => {
        if (window.innerWidth <= 860) {
          e.preventDefault();
          const willOpen = !item.classList.contains('open');
          $$('.has-dropdown', nav).forEach(o => o.classList.remove('open'));
          item.classList.toggle('open', willOpen);
          trigger.setAttribute('aria-expanded', String(willOpen));
        }
      });
    });

    // Al tocar un enlace que navega, cerramos el panel.
    $$('a[href^="#"]', nav).forEach(a => {
      a.addEventListener('click', () => {
        if (a.closest('.has-dropdown') && window.innerWidth <= 860 &&
            a.getAttribute('href').length <= 1) return;
        if (window.innerWidth <= 860) setOpen(false);
      });
    });

    // Reset al pasar a desktop.
    window.addEventListener('resize', () => {
      if (window.innerWidth > 860) {
        setOpen(false);
        $$('.has-dropdown', nav).forEach(o => o.classList.remove('open'));
      }
    });
  }

  /* ----------------------------------------------------------------------
     8. INTERSECTION OBSERVER — animaciones .reveal
  ---------------------------------------------------------------------- */
  function initReveal() {
    const items = $$('.reveal');
    if (items.length === 0) return;

    // Stagger automático: a los hijos .reveal de una misma grilla
    // les asignamos un retardo progresivo para que entren en cascada.
    $$('.needs-grid, .services-grid, .trust-strip, [data-track]').forEach(group => {
      Array.from(group.children).forEach((child, i) => {
        const r = child.classList.contains('reveal') ? child : child.querySelector('.reveal');
        if (r) { r.setAttribute('data-delay', ''); r.style.setProperty('--d', i * 90); }
      });
    });

    if (prefersReduced || !('IntersectionObserver' in window)) {
      items.forEach(el => el.classList.add('visible'));
      return;
    }
    const obs = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    items.forEach(el => obs.observe(el));
  }

  /* ----------------------------------------------------------------------
     8b. PARALLAX SUTIL DEL HERO
  ---------------------------------------------------------------------- */
  function initParallax() {
    const photo = $('.hero-photo');
    if (!photo || prefersReduced) return;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        if (y < window.innerHeight) photo.style.transform = `translateY(${y * 0.18}px) scale(1.06)`;
        ticking = false;
      });
    };
    photo.style.transform = 'scale(1.06)'; // margen para que el desplazamiento no muestre bordes
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ----------------------------------------------------------------------
     9. AÑO + INIT
  ---------------------------------------------------------------------- */
  function initYear() {
    $$('[data-year]').forEach(el => { el.textContent = new Date().getFullYear(); });
  }

  function init() {
    initContactForm();
    initCarousel();
    initLightbox();
    initHeader();
    initMobileNav();
    initReveal();
    initParallax();
    initYear();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
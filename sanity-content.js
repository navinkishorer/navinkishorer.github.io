(function () {
  const PROJECT_ID = '9z54yk9l';
  const DATASET = 'production';
  const API_VERSION = '2026-10-30';
  const HERO_FLAG = 'portfolio-hero-pitch';

  const QUERY = `*[_id == "homePage"][0]{
    availability,
    rolePitches[]{_key, role, headline, intro},
    aboutHeading,
    aboutBody,
    credentials[]{_key, title, detail, tag},
    experience[]{_key, company, role, period, location, companyBadge, bullets[]{_key, text, badge}},
    projects[]{_key, title, category, tags, summary, highlights, stack, links[]{_key, label, url},
      "caseSlug": select(count(caseStudy.body) > 0 => slug.current)},
    skillGroups[]{_key, heading, items},
    contactBlurb,
    pageTitle,
    metaDescription
  }`;

  const MARK_TAGS = {
    strong: ['<strong>', '</strong>'],
    em: ['<em>', '</em>'],
    highlight: ['<span class="g">', '</span>'],
  };

  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  const escLines = (s) => esc(s).replace(/\n/g, '<br>');

  const safeUrl = (url) => (/^(https?:|mailto:)/i.test(url || '') ? url : null);

  function blockHtml(block) {
    if (!block || !Array.isArray(block.children)) return '';
    return block.children
      .map((span) => {
        let html = escLines(span.text);
        for (const mark of span.marks || []) {
          const tags = MARK_TAGS[mark];
          if (tags) html = tags[0] + html + tags[1];
        }
        return html;
      })
      .join('');
  }

  const firstBlockHtml = (blocks) => (Array.isArray(blocks) && blocks.length ? blockHtml(blocks[0]) : '');
  const list = (arr) => (Array.isArray(arr) ? arr : []);

  const revealObserver = new IntersectionObserver(
    (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add('in')),
    { threshold: 0.1 }
  );

  function setHtml(el, html) {
    if (!el) return;
    el.innerHTML = html;
    el.querySelectorAll('.reveal').forEach((node) => revealObserver.observe(node));
  }

  function renderHero(data) {
    const badge = document.querySelector('.currently-badge');
    if (badge && data.availability) badge.innerHTML = '<span class="dot"></span>' + esc(data.availability);

    const pitches = list(data.rolePitches);
    const toggle = document.querySelector('.role-toggle');
    const heroH = document.getElementById('heroH');
    const heroP = document.getElementById('heroP');
    if (!pitches.length || !toggle || !heroH || !heroP) return;

    const show = (i) => {
      heroH.innerHTML = firstBlockHtml(pitches[i].headline);
      heroP.innerHTML = firstBlockHtml(pitches[i].intro);
      toggle.querySelectorAll('.rtb').forEach((b, j) => b.classList.toggle('on', i === j));
    };

    let userChose = false;
    toggle.innerHTML = pitches
      .map((p, i) => `<button class="rtb${i === 0 ? ' on' : ''}" type="button">${esc(p.role)}</button>`)
      .join('');
    toggle.querySelectorAll('.rtb').forEach((b, i) =>
      b.addEventListener('click', () => {
        userChose = true;
        show(i);
        if (window.posthog?.capture) window.posthog.capture('hero_role_selected', { role: pitches[i].role });
      })
    );
    toggle.style.display = pitches.length > 1 ? '' : 'none';
    show(0);

    // A/B test: flag "portfolio-hero-pitch", variant "pmm" defaults to the Product Marketing pitch.
    const applyFlag = () => {
      if (userChose) return;
      const variant = window.posthog?.getFeatureFlag?.(HERO_FLAG);
      if (variant !== 'pmm') return;
      const i = pitches.findIndex((p) => /product marketing/i.test(p.role || ''));
      if (i > 0) show(i);
    };
    if (window.posthog?.onFeatureFlags) window.posthog.onFeatureFlags(applyFlag);
  }

  function renderAbout(data) {
    const heading = document.querySelector('#about .section-h');
    if (heading && list(data.aboutHeading).length) heading.innerHTML = firstBlockHtml(data.aboutHeading);

    const textCol = document.querySelector('#about .about-grid > .reveal');
    if (textCol && list(data.aboutBody).length) {
      textCol.querySelectorAll('.about-p').forEach((p) => p.remove());
      textCol.insertAdjacentHTML(
        'beforeend',
        data.aboutBody.map((b) => `<p class="about-p">${blockHtml(b)}</p>`).join('')
      );
    }

    const creds = document.querySelector('#about .cred-list');
    if (creds && list(data.credentials).length) {
      creds.innerHTML = data.credentials
        .map(
          (c) => `<div class="cred">
            <div class="cred-t">${esc(c.title)}</div>
            ${c.detail ? `<div class="cred-s">${escLines(c.detail)}</div>` : ''}
            ${c.tag ? `<div class="ctag">${esc(c.tag)}</div>` : ''}
          </div>`
        )
        .join('');
    }
  }

  function renderExperience(data) {
    const wrap = document.querySelector('#experience .exp-wrap');
    if (!wrap || !list(data.experience).length) return;
    wrap.querySelectorAll('.exp-row').forEach((row) => row.remove());
    const rows = data.experience
      .map(
        (e) => `<div class="exp-row reveal">
          <div>
            <div class="exp-period">${esc(e.period)}</div>
            <div class="exp-co">${esc(e.company)}</div>
            <div class="exp-loc">${esc(e.location)}${e.companyBadge ? ` <span class="ebadge egd">${esc(e.companyBadge)}</span>` : ''}</div>
          </div>
          <div>
            <div class="exp-role">${esc(e.role)}</div>
            <ul class="exp-ul">${list(e.bullets)
              .map(
                (b) =>
                  `<li>${firstBlockHtml(b.text)}${b.badge ? ` <span class="ebadge ep">${esc(b.badge)}</span>` : ''}</li>`
              )
              .join('')}</ul>
          </div>
        </div>`
      )
      .join('');
    wrap.insertAdjacentHTML('beforeend', rows);
    wrap.querySelectorAll('.exp-row.reveal').forEach((node) => revealObserver.observe(node));
  }

  function renderProjects(data) {
    const grid = document.querySelector('#projects .proj-grid');
    if (!grid || !list(data.projects).length) return;
    setHtml(
      grid,
      data.projects
        .map((p, i) => {
          const num = String(i + 1).padStart(2, '0');
          const links = list(p.links).filter((l) => safeUrl(l.url));
          const caseSlug = /^[a-z0-9-]+$/.test(p.caseSlug || '') ? p.caseSlug : null;
          const caseLink = caseSlug ? `<a href="/projects/${caseSlug}/" class="plink">↗ Case study</a>` : '';
          return `<div class="pc reveal">
            <div class="pn">// ${num}${p.category ? ' · ' + esc(p.category) : ''}</div>
            <div class="pt">${esc(p.title)}</div>
            ${list(p.tags).length ? `<div class="ptags">${p.tags.map((t) => `<span class="ptag">${esc(t)}</span>`).join('')}</div>` : ''}
            ${p.summary ? `<p class="pd">${esc(p.summary)}</p>` : ''}
            ${list(p.highlights).length ? `<ul class="pbul">${p.highlights.map((h) => `<li>${blockHtml(h)}</li>`).join('')}</ul>` : ''}
            ${list(p.stack).length ? `<div class="pstack"><strong>Stack:</strong> ${p.stack.map(esc).join(' · ')}</div>` : ''}
            ${links.length || caseLink ? `<div class="plinks">${caseLink}${links.map((l) => `<a href="${esc(safeUrl(l.url))}" class="plink" target="_blank" rel="noopener">↗ ${esc(l.label)}</a>`).join('')}</div>` : ''}
          </div>`;
        })
        .join('')
    );
  }

  function renderSkills(data) {
    const grid = document.querySelector('#skills .sk-grid');
    if (!grid || !list(data.skillGroups).length) return;
    grid.innerHTML = data.skillGroups
      .map(
        (g) => `<div class="sk-col">
          <div class="sk-head">${esc(g.heading)}</div>
          ${list(g.items).map((item) => `<div class="sk-item">${esc(item)}</div>`).join('')}
        </div>`
      )
      .join('');
  }

  function renderContactAndMeta(data) {
    const blurb = document.querySelector('#contact .con-inner > p');
    if (blurb && data.contactBlurb) blurb.textContent = data.contactBlurb;
    if (data.pageTitle) document.title = data.pageTitle;
    const meta = document.querySelector('meta[name="description"]');
    if (meta && data.metaDescription) meta.setAttribute('content', data.metaDescription);
  }

  async function load() {
    const url =
      `https://${PROJECT_ID}.apicdn.sanity.io/v${API_VERSION}/data/query/${DATASET}` +
      `?query=${encodeURIComponent(QUERY)}`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Sanity responded ${res.status}`);
      const { result } = await res.json();
      if (!result) return;
      for (const render of [renderHero, renderAbout, renderExperience, renderProjects, renderSkills, renderContactAndMeta]) {
        try {
          render(result);
        } catch (err) {
          console.warn('[sanity-content] section render failed', err);
        }
      }
    } catch (err) {
      console.warn('[sanity-content] using built-in HTML content', err);
    }
  }

  load();
})();

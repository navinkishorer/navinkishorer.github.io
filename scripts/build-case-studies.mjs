// Builds the deployable site into _site/: a copy of the static files plus one
// pre-rendered page per Sanity case study at /projects/<slug>/, so link previews
// (LinkedIn, Slack) get each project's own title, description and image.
import {cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, '_site')
const SITE_URL = 'https://navinkishoreravikumar.com'
const PROJECT_ID = '9z54yk9l'
const DATASET = 'production'
const API_VERSION = '2026-10-30'
const FALLBACK_IMAGE = `${SITE_URL}/Assets/header-image.png`
const SKIP = new Set(['.git', '.github', '_site', 'scripts', 'node_modules', 'session-log.md', '.DS_Store'])

const QUERY = `*[_id == "homePage"][0]{
  "projects": projects[defined(slug.current) && count(caseStudy.body) > 0]{
    _key, title, category, tags, stack, links[]{label, url},
    "slug": slug.current,
    caseStudy{
      headline, dek, role, shareDescription,
      outcomes[]{value, label},
      coverImage{alt, hotspot, "url": asset->url},
      body[]{..., _type == "image" => {alt, caption, hotspot, "url": asset->url}}
    }
  }
}`

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c])
const safeUrl = (u) => (/^(https?:|mailto:)/i.test(u || '') ? u : null)

function imageUrl(img, w, h) {
  if (!img?.url) return null
  const params = new URLSearchParams({w: String(w), auto: 'format'})
  if (h) {
    params.set('h', String(h))
    params.set('fit', 'crop')
    if (img.hotspot) {
      params.set('crop', 'focalpoint')
      params.set('fp-x', String(img.hotspot.x))
      params.set('fp-y', String(img.hotspot.y))
    }
  }
  return `${img.url}?${params}`
}

function spansHtml(block) {
  const defs = Object.fromEntries((block.markDefs || []).map((d) => [d._key, d]))
  return (block.children || [])
    .map((span) => {
      let html = esc(span.text).replace(/\n/g, '<br>')
      for (const mark of span.marks || []) {
        if (mark === 'strong') html = `<strong>${html}</strong>`
        else if (mark === 'em') html = `<em>${html}</em>`
        else if (mark === 'code') html = `<code>${html}</code>`
        else if (defs[mark]?._type === 'link' && safeUrl(defs[mark].href)) {
          const href = safeUrl(defs[mark].href)
          const external = /^https?:/i.test(href) && !href.startsWith(SITE_URL)
          html = `<a href="${esc(href)}"${external ? ' target="_blank" rel="noopener"' : ''}>${html}</a>`
        }
      }
      return html
    })
    .join('')
}

function bodyHtml(blocks = []) {
  const out = []
  let list = null
  const closeList = () => {
    if (list) out.push(`</${list}>`)
    list = null
  }
  for (const b of blocks) {
    if (b._type === 'image') {
      closeList()
      const src = imageUrl(b, 1600)
      if (!src) continue
      out.push(
        `<figure><img src="${esc(src)}" alt="${esc(b.alt)}" loading="lazy">${b.caption ? `<figcaption>${esc(b.caption)}</figcaption>` : ''}</figure>`,
      )
      continue
    }
    if (b._type !== 'block') continue
    if (b.listItem) {
      const tag = b.listItem === 'number' ? 'ol' : 'ul'
      if (list !== tag) {
        closeList()
        out.push(`<${tag}>`)
        list = tag
      }
      out.push(`<li>${spansHtml(b)}</li>`)
      continue
    }
    closeList()
    const tag = {h2: 'h2', h3: 'h3', blockquote: 'blockquote'}[b.style] || 'p'
    out.push(`<${tag}>${spansHtml(b)}</${tag}>`)
  }
  closeList()
  return out.join('\n')
}

function analyticsSnippet() {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8')
  const posthog = html.match(/<script>\s*!function\(t,e\)[\s\S]*?posthog\.init\([\s\S]*?<\/script>/)
  if (!posthog) throw new Error('PostHog snippet not found in index.html')
  return posthog[0]
}

function page(p, analytics) {
  const cs = p.caseStudy
  const url = `${SITE_URL}/projects/${p.slug}/`
  const heading = cs.headline || p.title
  const title = `${heading} | Navin Kishore`
  const description = cs.shareDescription || cs.dek || ''
  const cover = imageUrl(cs.coverImage, 1200, 630)
  const ogImage = cover || FALLBACK_IMAGE
  const outcomes = (cs.outcomes || [])
    .map((o) => `<div class="cs-out"><div class="cs-out-n">${esc(o.value)}</div><div class="cs-out-l">${esc(o.label)}</div></div>`)
    .join('')
  const links = (p.links || []).filter((l) => safeUrl(l.url))

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />
  <link rel="canonical" href="${url}" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="Navin Kishore" />
  <meta property="og:title" content="${esc(heading)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:image" content="${esc(ogImage)}" />
  ${cover ? '<meta property="og:image:width" content="1200" />\n  <meta property="og:image:height" content="630" />' : ''}
  ${cs.coverImage?.alt ? `<meta property="og:image:alt" content="${esc(cs.coverImage.alt)}" />` : ''}
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(heading)}" />
  <meta name="twitter:description" content="${esc(description)}" />
  <meta name="twitter:image" content="${esc(ogImage)}" />
  <meta name="author" content="Navin Kishore Ravi Kumar" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Instrument+Sans:ital,wght@0,400;0,500;0,600;1,400&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />
  <link rel="icon" type="image/svg+xml" href="/Assets/favicon.svg?v=20260410" />
  <link rel="stylesheet" href="/case-study.css" />
  ${analytics}
</head>
<body>
  <nav class="cs-nav">
    <a href="/" class="cs-logo">Navin <em>Kishore</em></a>
    <a href="/#projects" class="cs-back">&larr; All projects</a>
  </nav>
  <main class="cs-main">
    <header class="cs-head">
      ${p.category ? `<div class="cs-eyebrow">${esc(p.category)}</div>` : ''}
      <h1>${esc(heading)}</h1>
      ${cs.dek ? `<p class="cs-dek">${esc(cs.dek)}</p>` : ''}
      ${cs.role ? `<p class="cs-role"><span>Role</span> ${esc(cs.role)}</p>` : ''}
    </header>
    ${outcomes ? `<section class="cs-outs">${outcomes}</section>` : ''}
    <article class="cs-body">
${bodyHtml(cs.body)}
    </article>
    ${(p.stack || []).length ? `<p class="cs-stack"><strong>Stack:</strong> ${p.stack.map(esc).join(' · ')}</p>` : ''}
    ${links.length ? `<p class="cs-links">${links.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">&nearr; ${esc(l.label)}</a>`).join('')}</p>` : ''}
    <aside class="cs-cta">
      <p>Want the details behind this work?</p>
      <a href="/#contact" class="cs-btn">Get in touch</a>
    </aside>
  </main>
  <script>
    if (window.posthog && posthog.capture) posthog.capture('case_study_viewed', { slug: ${JSON.stringify(p.slug)} });
  </script>
</body>
</html>
`
}

async function main() {
  const url = `https://${PROJECT_ID}.apicdn.sanity.io/v${API_VERSION}/data/query/${DATASET}?query=${encodeURIComponent(QUERY)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Sanity query failed: ${res.status} ${await res.text()}`)
  const {result} = await res.json()
  const projects = result?.projects || []

  rmSync(OUT, {recursive: true, force: true})
  mkdirSync(OUT, {recursive: true})
  for (const entry of readdirSync(ROOT)) {
    if (!SKIP.has(entry)) cpSync(join(ROOT, entry), join(OUT, entry), {recursive: true})
  }

  const analytics = analyticsSnippet()
  for (const p of projects) {
    const dir = join(OUT, 'projects', p.slug)
    mkdirSync(dir, {recursive: true})
    writeFileSync(join(dir, 'index.html'), page(p, analytics))
  }

  const urls = [`${SITE_URL}/`, ...projects.map((p) => `${SITE_URL}/projects/${p.slug}/`)]
  writeFileSync(
    join(OUT, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n')}\n</urlset>\n`,
  )
  console.log(`Built ${projects.length} case study page(s): ${projects.map((p) => p.slug).join(', ') || 'none'}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

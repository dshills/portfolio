# Hills Consulting

Company site for Hills Consulting, LLC — the consulting practice of Davin Hills.

Static HTML deployed on Vercel. No build step, no dependencies.

## Pages

- `index.html` — home: services, the open-source toolchain ("the route"), latest essays, experience, contact
- `projects.html` — open source, in four tiers, with search
- `writing.html` — essays on Medium, with search and topic filters
- `about.html` — the long story, working principles, and record

## Shared files

- `site.css` — the whole design system (survey-map theme: paper, ink, contour lines, one orange accent)
- `site.js` — contour-map canvases, scroll reveals, and the search / topic filters
- `favicon.svg`

## Editing content

Everything is plain HTML. To add an entry, copy an existing block and change it:

- essay → an `<a class="entry">` in `writing.html` (set `data-tags` to its topic), and update the three cards on the home page
- repo → an `<a class="row">`, `<a class="plot">`, or archive `<tr>` in `projects.html`

Counts shown in page copy (essay totals, tier sizes) are written by hand, so update them when the lists change.

## Local preview

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

`http.server` lets the browser cache pages, so after editing a page you viewed earlier a link can show the old copy. Hard-reload that page (Cmd+Shift+R) if something looks stale. The deployed site is not affected: Vercel makes browsers revalidate HTML on every visit.

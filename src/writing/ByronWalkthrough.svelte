<script>
  import { onMount } from 'svelte';

  const img = (name) => `/writing/byron/images/${name}`;

  const math = {
    compactionTake: String.raw`[your take. The standard LSM size ratio is 10×. Byron uses $\varphi \approx 1.618$. The real argument isn't aesthetics: smaller ratios mean more levels, but each compaction merges less data at once, so write amplification is smoother and worst-case write latency spikes shrink. Reads pay a small extra cost per level, but bloom filters absorb most of it.]`,
    compactionDetail: String.raw`When level $L_i$ grows to $\varphi \times |L_{i-1}|$, we compact a small number of tables from $L_i$ into $L_{i+1}$. With $\varphi \lt 2$, there are $O(\log N)$ levels, so inserts remain $O(\log N)$ overall. Merges use a min-heap streaming join across SSTable iterators.`,
    varintBytes: String.raw`Encoding nonnegative integer $N$ as a varint uses $S(N) = \lceil \log_2(N+1) / 7 \rceil$ bytes.`,
    varintExpectation: String.raw`By the tail-sum formula, $$\mathbb{E}[S] = \sum_{k=1}^{\infty} \Pr[S \ge k] = \sum_{k=1}^{\infty} \Pr[N \ge 2^{7(k-1)}].$$`,
    varintValues: String.raw`For uniform $N \in [0, A]$ with $A = 2^{32}-1$, this yields $\mathbb{E}[S] \approx 4.94$ bytes. For geometric $\Pr[N=n] = (1-p)^n p$ with $p = 0.2$, $\mathbb{E}[S] \approx 1$ byte.`,
    deltaSavings: String.raw`If the shared-prefix length between consecutive keys follows $\Pr[X=k] = p^k(1-p)$, then $\mathbb{E}[X] = p/(1-p)$. With restarts every $R$ keys ($R = 10$), a fraction $1 - 1/R$ of keys benefit: $$\mathbb{E}[\text{savings}] = (1 - 1/R)\,\mathbb{E}[X].$$`,
    collisionAnalysis: String.raw`Modeling occupancy as Poisson with $\lambda = 1$: empty slots occur with probability $P(0) \approx 0.368$, usable (single-entry) with $P(1) \approx 0.368$, cancelled (collision) with $\approx 0.264$. Conditioning on non-empty, $$\Pr[\text{usable} \mid \text{non-empty}] = \frac{P(1)}{P(0)+P(1)} \approx 0.58.$$`,
    collisionConclusion: String.raw`So ~60% of lookups resolve in $O(1)$; the rest fall back to $O(\log R)$ binary search.`
  };

  let mathRoot;

  onMount(() => {
    const KATEX_CSS = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css';
    const KATEX_JS = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js';
    const AUTO_JS = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js';

    const ensureStylesheet = (href) => {
      if (document.querySelector(`link[href="${href}"]`)) return;
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      document.head.appendChild(link);
    };

    const loadScript = (src) =>
      new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[src="${src}"]`);
        if (existing) {
          if (existing.dataset.loaded === 'true') {
            resolve();
          } else {
            existing.addEventListener('load', () => resolve());
            existing.addEventListener('error', reject);
          }
          return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.defer = true;
        script.addEventListener('load', () => {
          script.dataset.loaded = 'true';
          resolve();
        });
        script.addEventListener('error', reject);
        document.head.appendChild(script);
      });

    ensureStylesheet(KATEX_CSS);

    (async () => {
      try {
        await loadScript(KATEX_JS);
        await loadScript(AUTO_JS);
        if (window.renderMathInElement && mathRoot) {
          window.renderMathInElement(mathRoot, {
            delimiters: [
              { left: '$$', right: '$$', display: true },
              { left: '$', right: '$', display: false }
            ],
            throwOnError: false
          });
        }
      } catch (err) {
        console.error('katex load failed', err);
      }
    })();
  });
</script>

<svelte:head>
  <title>Byron — a walkthrough · Prominent Systems</title>
  <meta
    name="description"
    content="A walkthrough of Byron, an LSM-tree key-value store: design decisions, results, and what I'd change."
  />
</svelte:head>

<div class="walkthrough" bind:this={mathRoot}>
  <nav class="top-nav">
    <a href="#/">← back</a>
    <span class="top-nav-sep">/</span>
    <a href="#/">writing</a>
    <span class="top-nav-sep">/</span>
    <span class="top-nav-current">byron</span>
  </nav>

  <header class="wt-header">
    <div class="wt-eyebrow">walkthrough</div>
    <h1>Byron</h1>
    <div class="wt-subtitle">An LSM-tree key-value store, in Rust.</div>
    <div class="wt-meta">
      <a href="/papers/byron.pdf">pdf ↗</a>
      <span>·</span>
      <a href="https://github.com/arvaer/byron">source ↗</a>
      <span>·</span>
      <span>CS265 · Harvard · Spring 2025</span>
    </div>
  </header>

  <section class="hook">
    <p class="placeholder" data-slot="hook">
      [hook — one paragraph. What byron is, why you built it, the single most surprising thing about it.
      The headline number to hang everything on: skiplist vs vec, 136s → 28s at 10M inserts. End with
      one sentence that tees up the rest of the page.]
    </p>
  </section>

  <section class="part">
    <h2>Why an LSM</h2>
    <p class="placeholder" data-slot="why-lsm">
      [two or three sentences. What makes LSMs the right answer for write-heavy workloads, and what
      byron's take on that question actually is. Link out to Monkey / Dostoevsky for readers who want
      the academic lineage.]
    </p>
  </section>

  <section class="part">
    <div class="part-kicker">Design · 01</div>
    <h2>SSTable on-disk layout</h2>

    <p class="placeholder" data-slot="sstable-take">
      [your take. Why the SSTable layout is the load-bearing decision. Varint + delta + restart points
      + page hash index — frame it as one idea, not four. The idea: every byte on disk pays rent, and
      every CPU cache miss costs more than the disk read you were trying to avoid.]
    </p>

    <figure class="wt-figure">
      <img src={img('sstable_full.png')} alt="SSTable on-disk layout" />
      <figcaption>SSTable on-disk layout.</figcaption>
    </figure>

    <details class="from-paper">
      <summary>From the paper</summary>
      <p>
        byron uses a Log-Structured Merge Tree architecture and compacts stored data frequently to
        reduce fragmentation and improve read performance. SSTable blocks are aligned to 4 KB SSD
        pages for minimal random accesses and high sequential I/O throughput, and use key compression
        to pack more entries per page.
      </p>
      <ul>
        <li><strong>Varint encoding.</strong> Integer metadata (lengths, sequence numbers) stored as varints.</li>
        <li><strong>Delta encoding.</strong> Each key is recorded as the byte-suffix that differs from its predecessor.</li>
        <li><strong>Restart points.</strong> Every 10th key is stored in full, bounding in-block search cost.</li>
        <li><strong>Page hash index.</strong> An in-memory array of each block's first key for O(log N) lookup.</li>
      </ul>
    </details>

    <figure class="wt-figure">
      <img src={img('key_value_pair.png')} alt="Key-value pair structure" />
      <figcaption>Key-value pair structure: shared_bytes, unshared_bytes, value_bytes, key_delta, value.</figcaption>
    </figure>

    <div class="figure-pair">
      <figure class="wt-figure">
        <img src={img('restart_points.png')} alt="Restart points" />
        <figcaption>Restart points, one every 10 keys.</figcaption>
      </figure>
      <figure class="wt-figure">
        <img src={img('page_hash_index.png')} alt="Page hash index" />
        <figcaption>Page hash index — 8-bit slots over restart points.</figcaption>
      </figure>
    </div>

    <aside class="aside">
      <div class="aside-label">what I'd change</div>
      <p class="placeholder" data-slot="sstable-change">
        [what you'd reconsider. Candidates: the footer-in-RAM shortcut that makes reload expensive;
        the 8-bit hash index ceiling at 256 restarts; whether delta encoding was worth the
        engineering cost vs. block-level compression.]
      </p>
    </aside>
  </section>

  <section class="part">
    <div class="part-kicker">Design · 02</div>
    <h2>Memtable: double-buffered vec → lock-free skiplist</h2>

    <p class="placeholder" data-slot="memtable-take">
      [your take. Frame the evolution honestly: you started with what looked like the obvious,
      simplest thing (two vectors, flip on flush), and it didn't scale. The skiplist isn't a clever
      flex — it's the right primitive for ordered concurrent inserts and it makes flush trivially
      streamable. The lesson is about when to stop rolling your own and reach for crossbeam.]
    </p>

    <div class="figure-pair">
      <figure class="wt-figure">
        <img src={img('memtables.png')} alt="Double-buffered memtable" />
        <figcaption>Original: double-buffered vector.</figcaption>
      </figure>
      <figure class="wt-figure">
        <img src={img('memtable_array.png')} alt="Skiplist array" />
        <figcaption>Enhanced: array of lock-free skiplists.</figcaption>
      </figure>
    </div>

    <details class="from-paper">
      <summary>From the paper</summary>
      <p>
        Originally, byron used a double-buffered vector for the memtable. Once the active buffer
        reached 2 MB, it became immutable and flushed in the background while new writes went into
        the other buffer. Appends were amortized O(1) and lock-free for producers, but GETs had to
        linear-scan both buffers.
      </p>
      <p>
        The enhanced design replaces backing vectors with a Crossbeam SkipMap. Inserts and lookups
        become O(log n) but thread-safe; the built-in ordering eliminates the sort/merge step on
        flush. Measured cache miss rate dropped from 10.69% (vector) to 4.99% (skiplist).
      </p>
    </details>

    <aside class="aside">
      <div class="aside-label">what I'd change</div>
      <p class="placeholder" data-slot="memtable-change">
        [honest retrospective. The "memtable array" you ended up with is a stop-gap. What would a
        cleaner concurrent-flush design look like? Is the array of skiplists an artifact of not
        having a WAL yet?]
      </p>
    </aside>
  </section>

  <section class="part">
    <div class="part-kicker">Design · 03</div>
    <h2>Bloom filters + fence pointers</h2>

    <p class="placeholder" data-slot="bloom-take">
      [your take. The Monkey paper's insight is that bloom filter bit budget should be allocated
      across levels proportional to data volume — bigger levels get more bits per key. Pair that
      with fence pointers and most GETs incur zero or one disk read. The point to make: these aren't
      separate optimizations. They're a two-tier in-memory index that only exists because the disk
      layout earned the space.]
    </p>

    <aside class="aside">
      <div class="aside-label">the curve to remember</div>
      <p class="placeholder" data-slot="bloom-curve">
        [the experiment showed diminishing returns past ~1–2 bits/key. Call out the number people
        should actually remember, and why. 100K→1M bits saved ~8%. 1M→10M saved another ~4%. The
        knee is around 1 bit/key.]
      </p>
    </aside>
  </section>

  <section class="part">
    <div class="part-kicker">Design · 04</div>
    <h2>Compaction — the golden ratio</h2>

    <p class="placeholder" data-slot="compaction-take">{math.compactionTake}</p>

    <details class="from-paper">
      <summary>From the paper</summary>
      <p>{math.compactionDetail}</p>
    </details>
  </section>

  <section class="part">
    <div class="part-kicker">The experiment that mattered</div>
    <h2>Skiplist vs. vec at 10M inserts</h2>

    <figure class="wt-figure">
      <img src={img('skiplist_v_memtable.png')} alt="Skiplist vs vector write time" />
      <figcaption>Write time vs. inserts — vec double-buffer vs. lock-free skiplist.</figcaption>
    </figure>

    <table class="wt-table">
      <thead>
        <tr><th>inserts</th><th>vec (s)</th><th>skiplist (s)</th><th>speedup</th></tr>
      </thead>
      <tbody>
        <tr><td>1M</td><td>2.53</td><td>2.25</td><td>1.1×</td></tr>
        <tr><td>5M</td><td>21.40</td><td>13.12</td><td>1.6×</td></tr>
        <tr><td>10M</td><td>136.41</td><td>27.92</td><td>4.9×</td></tr>
      </tbody>
    </table>

    <p class="placeholder" data-slot="experiment-commentary">
      [why this is the result that should stick with the reader. Not the aggregate throughput
      numbers — those are incremental. This is the design decision paying for itself by a factor
      of five at the scale you actually care about. Say it plainly.]
    </p>
  </section>

  <section class="part">
    <h2>Results at a glance</h2>

    <table class="wt-table">
      <thead>
        <tr><th>op</th><th>throughput</th><th>cache miss</th><th>bound by</th></tr>
      </thead>
      <tbody>
        <tr><td>GET</td><td>~33K/s (1M in 30s)</td><td>3–4% steady</td><td>CPU — bloom + fence hit most lookups</td></tr>
        <tr><td>PUT</td><td>~400K/s (linear to 10M)</td><td>~8% at 10M</td><td>compaction</td></tr>
        <tr><td>RANGE</td><td>~200K keys/s</td><td>~5%</td><td>SSD sequential read</td></tr>
        <tr><td>DELETE</td><td>~500K/s</td><td>~12%</td><td>memtable write + compaction defer</td></tr>
      </tbody>
    </table>

    <figure class="wt-figure">
      <img src={img('get_performance.png')} alt="GET performance vs. queries" />
      <figcaption>GET performance scaling (uniform distribution).</figcaption>
    </figure>
  </section>

  <section class="part">
    <h2>The math, for the curious</h2>

    <details class="math-block">
      <summary>Varint expected size</summary>
      <p>{math.varintBytes}</p>
      <p>{math.varintExpectation}</p>
      <p>{math.varintValues}</p>
      <p class="placeholder" data-slot="varint-comment">
        [one line of commentary. Why this matters in practice: on workloads with skewed small keys,
        varint is close-to-free; on uniform 32-bit keys it's roughly break-even with fixed-width.]
      </p>
    </details>

    <details class="math-block">
      <summary>Delta encoding — expected savings</summary>
      <p>{math.deltaSavings}</p>
      <p class="placeholder" data-slot="delta-comment">
        [commentary. The real win is in skewed-prefix workloads like timestamps or path-like keys —
        where delta encoding approaches a small constant. On random keys it's a rounding error.]
      </p>
    </details>

    <details class="math-block">
      <summary>Page hash index — collision analysis</summary>
      <p>{math.collisionAnalysis}</p>
      <p>{math.collisionConclusion}</p>
      <p class="placeholder" data-slot="hash-comment">
        [commentary. Is the hash index worth the complexity? The paper says yes; what's your
        opinion now? 60% O(1) is nice, but binary search over 10 restart points is basically free.]
      </p>
    </details>
  </section>

  <section class="part">
    <h2>Retrospective</h2>

    <aside class="aside">
      <div class="aside-label">what I'd cut</div>
      <p class="placeholder" data-slot="retro-cut">
        [things that didn't earn their keep. Candidates: the Mixed 1M experiment that enabled rayon
        and confounded the comparison; the duplicated Conclusion section; the speculative future
        work bullets that should've been a roadmap not a list.]
      </p>
    </aside>

    <aside class="aside">
      <div class="aside-label">what a v2 would look like</div>
      <p class="placeholder" data-slot="retro-v2">
        [the honest sequel. WAL for durability. Real multi-threaded compaction scheduler, not
        rayon-over-a-flat-list. Reconsider the footer-in-RAM decision if we ever need fast cold
        starts. Maybe kill the page hash index entirely in favor of tighter bloom filters.]
      </p>
    </aside>

    <aside class="aside">
      <div class="aside-label">what I learned</div>
      <p class="placeholder" data-slot="retro-learned">
        [the thing that generalizes. Data structures are cheap; concurrency is expensive. The
        skiplist switch wasn't clever algorithm work — it was admitting the concurrency model
        matters more than the O-notation.]
      </p>
    </aside>
  </section>

  <footer class="wt-footer">
    <a href="/papers/byron.pdf">download pdf ↗</a>
    <span>·</span>
    <a href="https://github.com/arvaer/byron">github.com/arvaer/byron ↗</a>
    <span>·</span>
    <a href="#/">← back to writing</a>
  </footer>
</div>

<style>
  .walkthrough {
    max-width: 720px;
    margin: 0 auto;
    padding: 48px 24px 120px;
    color: var(--text);
  }

  .top-nav {
    display: flex;
    gap: 10px;
    align-items: center;
    font-size: 0.72rem;
    color: var(--text-dim);
    letter-spacing: 0.04em;
    margin-bottom: 56px;
  }

  .top-nav a {
    color: var(--text-dim);
    text-decoration: none;
    transition: color 0.2s;
  }

  .top-nav a:hover {
    color: var(--text-bright);
  }

  .top-nav-sep {
    opacity: 0.4;
  }

  .top-nav-current {
    color: var(--text-bright);
  }

  .wt-header {
    padding-bottom: 40px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 40px;
  }

  .wt-eyebrow {
    font-size: 0.7rem;
    color: var(--text-dim);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    margin-bottom: 18px;
  }

  .wt-header h1 {
    font-family: var(--serif);
    font-weight: 400;
    font-size: 2.4rem;
    color: var(--text-bright);
    letter-spacing: -0.02em;
    margin-bottom: 8px;
  }

  .wt-subtitle {
    font-family: var(--serif);
    font-style: italic;
    font-size: 1.05rem;
    color: var(--text);
    margin-bottom: 28px;
  }

  .wt-meta {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    font-size: 0.74rem;
    color: var(--text-dim);
    letter-spacing: 0.02em;
  }

  .wt-meta a {
    color: var(--accent);
    text-decoration: none;
    transition: color 0.2s;
  }

  .wt-meta a:hover {
    color: var(--text-bright);
  }

  .wt-meta span {
    opacity: 0.5;
  }

  .hook {
    padding: 8px 0 48px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 48px;
  }

  .hook p {
    font-family: var(--serif);
    font-size: 1.18rem;
    line-height: 1.7;
    color: var(--text-bright);
  }

  .part {
    padding: 32px 0 56px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 16px;
  }

  .part:last-of-type {
    border-bottom: none;
  }

  .part-kicker {
    font-size: 0.7rem;
    color: var(--accent);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    margin-bottom: 12px;
  }

  .part h2 {
    font-family: var(--serif);
    font-weight: 400;
    font-size: 1.6rem;
    color: var(--text-bright);
    letter-spacing: -0.01em;
    margin-bottom: 24px;
    line-height: 1.25;
  }

  .part p {
    font-size: 0.9rem;
    line-height: 1.8;
    margin-bottom: 20px;
  }

  .placeholder {
    font-family: var(--mono);
    font-size: 0.82rem !important;
    color: var(--text-dim);
    background: rgba(184, 151, 126, 0.04);
    border-left: 2px solid var(--accent-dim);
    padding: 14px 18px;
    font-style: normal;
    line-height: 1.7 !important;
  }

  .wt-figure {
    margin: 28px 0;
  }

  .wt-figure img {
    display: block;
    width: 100%;
    height: auto;
    background: var(--bg-subtle);
    border: 1px solid var(--border);
    padding: 12px;
  }

  .wt-figure figcaption {
    font-size: 0.74rem;
    color: var(--text-dim);
    text-align: center;
    margin-top: 10px;
    font-style: italic;
    font-family: var(--serif);
  }

  .figure-pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 18px;
  }

  .figure-pair .wt-figure {
    margin: 20px 0;
  }

  .from-paper,
  .math-block {
    background: var(--bg-subtle);
    border: 1px solid var(--border);
    padding: 16px 20px;
    margin: 24px 0;
    border-radius: 2px;
  }

  .from-paper summary,
  .math-block summary {
    font-size: 0.74rem;
    color: var(--text-dim);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    cursor: pointer;
    list-style: none;
    user-select: none;
  }

  .from-paper summary::before,
  .math-block summary::before {
    content: '+ ';
    color: var(--accent);
  }

  .from-paper[open] summary::before,
  .math-block[open] summary::before {
    content: '− ';
  }

  .from-paper[open] summary,
  .math-block[open] summary {
    margin-bottom: 14px;
    border-bottom: 1px solid var(--border);
    padding-bottom: 10px;
  }

  .from-paper p,
  .math-block p {
    font-size: 0.84rem;
    line-height: 1.75;
    margin: 10px 0;
    color: var(--text);
  }

  .from-paper ul {
    margin: 10px 0 10px 20px;
    font-size: 0.84rem;
    line-height: 1.8;
  }

  .from-paper li {
    margin-bottom: 4px;
  }

  .aside {
    margin: 28px 0;
    padding: 18px 22px;
    border-left: 2px solid var(--accent);
    background: rgba(184, 151, 126, 0.03);
  }

  .aside-label {
    font-size: 0.7rem;
    color: var(--accent);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    margin-bottom: 10px;
  }

  .aside p {
    margin: 0;
  }

  .wt-table {
    width: 100%;
    border-collapse: collapse;
    margin: 24px 0;
    font-size: 0.82rem;
  }

  .wt-table th,
  .wt-table td {
    text-align: left;
    padding: 10px 12px;
    border-bottom: 1px solid var(--border);
  }

  .wt-table th {
    font-size: 0.7rem;
    color: var(--text-dim);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    font-weight: 500;
  }

  .wt-table td {
    color: var(--text);
  }

  .wt-footer {
    margin-top: 60px;
    padding-top: 24px;
    border-top: 1px solid var(--border);
    display: flex;
    gap: 14px;
    flex-wrap: wrap;
    font-size: 0.78rem;
    color: var(--text-dim);
  }

  .wt-footer a {
    color: var(--accent);
    text-decoration: none;
    transition: color 0.2s;
  }

  .wt-footer a:hover {
    color: var(--text-bright);
  }

  .wt-footer span {
    opacity: 0.5;
  }

  @media (max-width: 620px) {
    .walkthrough {
      padding: 32px 20px 80px;
    }

    .wt-header h1 {
      font-size: 1.9rem;
    }

    .part h2 {
      font-size: 1.35rem;
    }

    .figure-pair {
      grid-template-columns: 1fr;
      gap: 0;
    }

    .hook p {
      font-size: 1.05rem;
    }
  }
</style>

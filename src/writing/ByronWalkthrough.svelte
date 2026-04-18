<script>
  import { onMount } from 'svelte';

  const img = (name) => `/writing/byron/images/${name}`;

  const math = {
    compactionTake: String.raw`The standard LSM size ratio is 10× the previous sstable level. Byron uses $\varphi \approx 1.618$. True afficionados will point to the Design space and assert something about smaller ratios having lower write amplification etc. Honestly, I chose the golden ratio because it occurs in nature. It honestly performs really well too!`,
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
    <p data-slot="hook">
      byron is an embedded key value store- it uses a Log Structured Merge Tree as the backing datastore and it was written completely in rust with zero unsafe blocks in the crate itself.
      Naturally, it depends on transitively unsafe code in other packages but that's beside the point. 
      The most fascinating thing about this project is that I was able to speed up the time it took for 10 million writes from 136s to 28s
      on commodity hardware using open source packages and, dare I say, making good design choices. It was also fun to work on-- imperfection was (and is!) acceptable, the code is uncomplicated, motivations pure :)
    </p>
  </section>

  <section class="part">
    <h2>Why an LSM</h2>
    <div class="prose" data-slot="why-lsm">
      <p>
	I suppose the correct answer is 'LSM's play a pivotal role in write heavy workloads.' But this project was never about that. In fact, by the end of this, I hope to convice anyone who's reading that there's nothing special about LSM's. Also, 'Log Structred Merge Trees?' I mean, that doesn't even sound cool.
	To be totally honest, this was a class assignment. The thing is, I left with so much more than just another fancy hashmap inside of a github repository.
	To me, byron was a journey, and I hope to share that with you.
      </p>
      <p>There are many famous key value stores from dynamodb to mongodb to rocksdb... And one would assume that these databases are incredibly complex and highly optimized and gee unless you have a PHD you may as well give up trying to write your own.
      And i'm here to tell you that you can indeed create a sick piece of software that is highly performant and can scale workloads well. The jury's still out on RAFT though I still owe myself a distributed impl of byron but I digress.</p>
      <p>In byron, we see that we can recover a lot of this performance without optimizing every stack allocation; and instead high level architectural decisions combined with the flexibility of Rust's trait system are amazing tools.</p>
    </div>
  </section>

  <section class="part">
    <div class="part-kicker">Design · 01</div>
    <h2>SSTable on-disk layout</h2>

    <div class="prose" data-slot="sstable-take">
      <p>SSTables are the foundation upon which byron-- and in turn, LSMs are built. They literally are basically just flat text files with some fancy encoding schemes.
	It's seriously just taking strings and writing them to disk. When I was first learning about LSMs and Database internals, I thought that whatever the resident datastructure was--
	rather, what the data looked like had to be complicated. Perhaps that's because i've accidentally tried to open binaries with Neovim. Or perhaps it's cachet or perhaps I just naturally associate hardcore sounding things with complexity. Whatever it was, before I started, I was under the impression that it was going to take some serious study to grok these systems.</p>

      <p>Alas, as Sussman says in SICP 'to gain power over a spirit you must name it,' and there really is no magic here. Again,  when I was researching and planning and reading the original LSM papers, I very much thought "Golly this is going to be very complex." It's not! RocksDB is completely open source, and you can go look at their sstable implementation <a href="https://github.com/facebook/rocksdb/tree/main/table">https://github.com/facebook/rocksdb/tree/main/table</a> It's shockingly easy to read and work through. And if you do, I'm sure you'll arrive at a similar conclusion.</p>

      <p>
	As a side note, I think I (we?) gravitate towards things that are complex or... atleast seem complex. I think it's because our lizard brains assume the complex thing is more novel or something.
	There's a whole boatload of scientist that said simplicity is the ultimate sophistication though. But perhaps they never saw shrodingers equations? Who's to say...

	Perhaps we should substitute the word 'pure' in for simple; consider Maxwell's equations, or the Metacircular Evaluator in SICP. The idea's themselves are indeed quite sophisticated... and perhaps what's special is that there's very little ceremony about them. So it's not that they're simple... It's almost like, through the compression of idea space, we as human's are able to project part of ourselves onto the empty space the ideas purposefully leave in their canvas.
	Perhaps this isn't making any sense... perhaps it is. Either way, I think that's why people find artistic value in these equations. And in terms of novelty-- I think pure ideas are so beautiful because they allow you to arrive in all sorts of places through some simple contemplation.
      </p>
      <p>So... yes, the SSTable is incredibly simple, and that fact is the bedrock for the optimizations we lay ontop of it.</p>
    </div>

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
	Stratos began the semester with the idea that every layer you traverse in the memory hierarchy is orders of magnitude slower. Retrieving something from l1 vs on disk is equivalent to walking 50m vs taking a space shuttle to pluto. Big deal.
	Honestly, due to my inexperience at the time of writing, I believe my implementation was materializing too much of the sstable in memory. I would redesign to make sure the footers-in-ram were cheaply loadable and I'd remove any sort of copy semantics that were used. I would also overlay additional zlib compression on the delta encoded sections of the sstable and really lean into the 8bit hash table and these footers so I could inrease the operational intensity of the system.
	Another great mistake I made was starting-- what I thought, was simply. The first version of the system was a grpc server around an in memory hash map just doing reads and writes.
	It would have been more educative if I earned those abstractions instead. I wish I had started with I/O first and really nailing that, and building upwards. Bottom up, you may say, instead of top down.
      </p>
    </aside>
  </section>

  <section class="part">
    <div class="part-kicker">Design · 02</div>
    <h2>Memtable: double-buffered vec → lock-free skiplist</h2>

    <p class="placeholder" data-slot="memtable-take">
      The simplest form of a memtable is a vector that you shove things into. Great for an initial uncomplicated start. Not so great for performance.

      To recap, a memtable is a fast in-memory buffer that you can store write operations in side of before writing them to disk in the form of an sstable. It also serves as a cache-- we tend to see great 'read' performance from memtables because it is not uncommon to read values relatively soon after they have been written. This thesis holds for SSTables as well-- we tend to be more comfortable paying more to retrieve values that are 'older' in terms of how long ago they were stored.

      When the vector fills up, whatever's inside of it gets turned into an sstable. SSTables are sorted string tables... so that takes time cuz you have to sort them.
      A natural next step for me was to just keep a second buffer around so I could flip them. Something like a primary and secondary-- when primary is closed to full i can swing the pointers and flush to disk.  

      This is a technique that they use in video game programming with swap chains. When rendering, one frame is getting painted and the other frame is being streamed into a backing buffer and they swap. I thought I was onto something by cannibalizing my internal representation of double buffering. 

      Yeah. That really didn't scale very well. There was a lot of memory contention between different threads trying to write to the same buffer, and synchronization was very expensive under load.
      And then I discovered the skip list. If you were following my simplicity tangent from earlier-- this is one of those moments where choosing the right tool, for the perfect job, results in a simpler implementation. Instead of jamming a bunch of overhead to get my vector backed memtable to work and be performant, using crossbeam's skiplist-- a battle tested datastructure, pretty much allowed me to remove a significant amount of code and get writes to be screaming fast. It's exactly the right primitive for concurrent inserts and it's already sorted so it makes flushing streamable.

      So, the lesson I took away: earn the abstraction. Earn the data structure-- it's true that when you pick the right datastrucutre, the algorithm that gets used naturally optimizes itself. This is one of those cases.
      
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

  .prose {
    margin-bottom: 8px;
  }

  .prose p {
    font-family: var(--serif);
    font-size: 1.02rem;
    line-height: 1.75;
    color: var(--text-bright);
    margin: 0 0 1.1em;
  }

  .prose p:last-child {
    margin-bottom: 0;
  }

  .prose a {
    color: var(--accent);
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 3px;
    word-break: break-all;
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

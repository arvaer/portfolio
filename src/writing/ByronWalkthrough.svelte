<script>
  import { onMount } from 'svelte';

  const img = (name) => `/writing/byron/images/${name}`;

  const math = {
    compactionTake: String.raw`The standard LSM size ratio is 10× the previous sstable level. Byron uses $\varphi \approx 1.618$. True aficionados will point to the Design space and assert something about smaller ratios having lower write amplification etc. Honestly, I chose the golden ratio because it occurs in nature. It honestly performs really well too!`,
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
      <span class="lede">Byron is an embedded key value store</span> — it uses a Log Structured Merge Tree as the backing datastore and it was written completely in rust with zero unsafe blocks in the crate itself. Naturally, it depends on transitively unsafe code in other packages but that's beside the point. The most fascinating thing about this project is that I was able to speed up the time it took for 10 million writes from 136s to 28s on commodity hardware using open source packages and, dare I say, making good design choices. It was also fun to work on — imperfection was (and is!) acceptable, the code is uncomplicated, motivations pure :)
    </p>
  </section>

  <section class="part">
    <h2>Why an LSM</h2>
    <div class="prose" data-slot="why-lsm">
      <p>
	I suppose the correct answer is 'LSM's play a pivotal role in write heavy workloads.' But this project was never about that. In fact, by the end of this, I hope to convince anyone who's reading that there's nothing special about LSM's. Also, 'Log Structured Merge Trees?' I mean, that doesn't even sound cool.
	To be totally honest, this was a class assignment. The thing is, I left with so much more than just another fancy hashmap inside of a github repository.
	To me, byron was a journey, and I hope to share that with you.
      </p>
      <p>There are many famous key value stores from dynamodb to mongodb to rocksdb... And one would assume that these databases are incredibly complex and highly optimized and gee unless you have a PHD you may as well give up trying to write your own.
      And i'm here to tell you that you can indeed create a sick piece of software that is highly performant and can scale workloads well. The jury's still out on RAFT though I still owe myself a distributed impl of byron but I digress.</p>
      <p>In byron, we see that we can recover a lot of this performance without optimizing every stack allocation; and instead high level architectural decisions combined with the flexibility of Rust's trait system are amazing tools.</p>
    </div>
  </section>

  <section class="part">
    <div class="part-kicker">The cast of characters</div>
    <h2>Anatomy of byron</h2>

    <div class="prose" data-slot="anatomy">
      <p>Exciting stuff, I know. The entire system revolves around four parts: SSTables, memtables, bloom filters, and fence pointers. Before we walk through how a read flows, here's each one in a sentence.</p>

      <p>An <strong>SSTable</strong> is a flat file of sorted key-value pairs. That's it. Immutable, append-only, never mutated once written — the durable half of byron. SSTables are organized in hierarchies (level 0, 1, ... N), and a policy decides how many accumulate in each layer before they get compacted down.</p>

      <p>A <strong>memtable</strong> is the fast in-memory buffer where new writes land before they get flushed to disk. Depending on where you are in the software engineering world, "memtable" could mean a few different things. In byron, it's a skiplist.</p>

      <p>A <strong>bloom filter</strong> is a probabilistic data structure for set membership in O(1). It tells you "maybe here" or "certainly not here" — and the certainly-not answers are where a lot of read performance comes from.</p>

      <p>A <strong>fence pointer</strong> is a tiny in-memory array that tracks each on-disk block an SSTable lives in. The pointers are binary-searchable, which turns reads from O(n) into O(log n).</p>
    </div>
  </section>

  <section class="part">
    <div class="part-kicker">Putting it together</div>
    <h2>The read path</h2>

    <p class="placeholder" data-slot="readpath-intro">
      By the end of this section you'll understand the entire system; the driving line is that at every step, if we don't get the answer, we try to constrain the search space. Each GET Request touches every part in a very specific order to do this.
    </p>

    <figure class="wt-figure">
      <img src={img('read_path.png')} alt="Read path through byron — bloom filters gate fence pointers which point at SSTables" />
      <figcaption>A GET flowing through byron: each SSTable's bloom filter gates its fence pointer, which points at the one block that might contain the key. Memtable is checked first (not shown).</figcaption>
    </figure>

    <ol class="readpath-steps">
      <li>
        <div class="step-header">
          <span class="step-num">1</span>
          <strong>Check the memtable.</strong>
        </div>
        <p class="placeholder" data-slot="readpath-memtable">
          First we check the active memtable. It holds at most 2MB, so lookups are bounded. Hit? We're done. Miss? Keep going.
        </p>
      </li>

      <li>
        <div class="step-header">
          <span class="step-num">2</span>
          <strong>Walk SSTables newest → oldest. Ask each bloom filter first.</strong>
        </div>
        <p class="placeholder" data-slot="readpath-bloom">
          Before actually reading an SSTable, we check its bloom filter. A "certainly not here" lets us skip the whole table. The bloom filter eats most of the lookups and saves us from scanning.
        </p>
      </li>

      <li>
        <div class="step-header">
          <span class="step-num">3</span>
          <strong>Bloom filter says "maybe"? Use the fence pointer to find the block.</strong>
        </div>
        <p class="placeholder" data-slot="readpath-fence">
          A "maybe" sends us to the fence pointer array. Binary search over first-keys to find the one block that might contain our key. Still in memory — we haven't touched disk.
        </p>
      </li>

      <li>
        <div class="step-header">
          <span class="step-num">4</span>
          <strong>Read the block. Use the hash index. Decode deltas if needed.</strong>
        </div>
        <p class="placeholder" data-slot="readpath-block">
          Now we read the block. The hash index resolves ~60% of lookups in O(1); the rest fall back to binary search over restart points. Decode the delta run, return the value.
        </p>
      </li>
    </ol>

    <p class="placeholder" data-slot="readpath-payoff">
	Most GETs incur 0 or 1 disk read. The bloom filter + fence pointer combo is a two-tier in-memory index that only exists because the disk layout earned the space. This is literally the entire system-- the rest of the post builds things from the disk up.
    </p>
  </section>

  <section class="part">
    <div class="part-kicker">Design · 01</div>
    <h2>SSTable on-disk layout</h2>

    <div class="prose" data-slot="sstable-take">
      <p>SSTables are the foundation upon which byron-- and in turn, LSMs are built. They literally are basically just flat text files with some fancy encoding schemes.
	It's seriously just taking strings and writing them to disk. When I was first learning about LSMs and Database internals, I thought that whatever the resident datastructure was--
	rather, what the data looked like had to be complicated. Perhaps that's because i've accidentally tried to open binaries with Neovim. Or perhaps it's cachet or perhaps I just naturally associate hardcore sounding things with complexity. Whatever it was, before I started, I was under the impression that it was going to take some serious study to grok these systems.</p>

      <p>Alas, as Sussman says in SICP 'to gain power over a spirit you must name it,' and there really is no magic here. Again, when I was researching and planning and reading the original LSM papers, I very much thought "Golly this is going to be very complex." It's not! RocksDB is completely open source, and you can go look at their sstable implementation <a href="https://github.com/facebook/rocksdb/tree/main/table">https://github.com/facebook/rocksdb/tree/main/table</a> It's shockingly easy to read and work through. And if you do, I'm sure you'll arrive at a similar conclusion.</p>

      <blockquote class="pullquote">
        You see, to gain power over a spirit, you must know its name. And we have now given you the name of the spirit that lives in the machine.
        <cite>— Gerald Jay Sussman</cite>
      </blockquote>

      <details class="tangent">
        <summary>a tangent on simplicity (click to expand)</summary>
        <p>As a side note, I think I (we?) gravitate towards things that are complex or... at least seem complex. I think it's because our lizard brains assume the complex thing is more novel or something. There's a whole boatload of scientists that say simplicity is the ultimate sophistication. Why?</p>
        <p>Perhaps we should substitute the word 'pure' in for simple; consider Maxwell's equations, or the Metacircular Evaluator in SICP. The ideas themselves are indeed quite sophisticated... and perhaps what's special is that there's very little ceremony about them. So it's not that they're simple...</p>
        <p>I'm going to make a crude analogy here. Imagine that there is a blank canvas called the 'idea space.' A pure representation of an idea-- a painting if you may, could be one that purposefully leaves space on the canvas. Not through some obtuse compression or fancy techniques; simply in the fact that it contains little else. And in that space we humans are able to project part of ourselves into the empty space left on the canvas. In a way, we're able to interpret these idea canvas paintings more honestly, and personally.</p>
        <p>Perhaps this isn't making any sense... perhaps it is. Either way, I think it's why some people can find artistic value in mathematical equations the same way one might in a Rembrandt. And in terms of novelty-- I think pure ideas are so beautiful because they allow you to arrive in all sorts of places through contemplation.</p>
      </details>
      <p>So... yes, the SSTable is incredibly simple, and that fact is the bedrock for the optimizations we lay on top of it.</p>
    </div>

    <figure class="wt-figure">
      <img src={img('sstable_full.png')} alt="SSTable on-disk layout" />
      <figcaption>SSTable on-disk layout — 4 KB blocks, delta-encoded keys, restart points, and a tiny page-hash footer.</figcaption>
    </figure>

    <p class="prose">On top of this simple layout sit four small optimizations — varints, deltas, restart points, and a page hash index. We'll build them up one at a time.</p>

    <div class="subpart">
      <div class="subpart-kicker">Optimization · A</div>
      <h3>Varint encoding</h3>
      <p class="placeholder" data-slot="varint-take">
	"Instead of representing fields as flat integers, we use variable-width integers."
	This is one of the optimizations that is a weird mixture of incredibly simple, very effective... and also very awkward in isolation. Fundamentally, it's a way to save space but it's only a few bytes per field. When you realize, however, that this is multiplied across every key stored in all of the SSTables, you realize that this has massive compounding gains.
      </p>

      <div class="figure-pair">
        <figure class="wt-figure">
          <img src={img('uniform.png')} alt="Expected varint size under uniform distribution" />
          <figcaption>Expected varint size under a uniform distribution — grows with max key size.</figcaption>
        </figure>
        <figure class="wt-figure">
          <img src={img('geometric.png')} alt="Expected varint size under geometric distribution" />
          <figcaption>Expected varint size under a geometric distribution — collapses toward ~1 byte for small p.</figcaption>
        </figure>
      </div>

      <details class="math-block">
        <summary>The math — varint expected size</summary>
        <p>{math.varintBytes}</p>
        <p>{math.varintExpectation}</p>
        <p>{math.varintValues}</p>
        <p class="math-takeaway">On skewed small keys, varint is close-to-free. On uniform 32bit keys it's roughly break-even with fixed-width — so the win depends entirely on the shape of your data.</p>
      </details>
    </div>

    <div class="subpart">
      <div class="subpart-kicker">Optimization · B</div>
      <h3>Delta encoding</h3>
      <p class="placeholder" data-slot="delta-take">
        Each key gets split into (shared_bytes, unshared_bytes, value_bytes, key_delta, value), only the suffix that differs from the previous key gets stored.
	Imagine you had a bunch of key value pairs that were related to each other. Naturally, you would have similar names for the keys like user-001 user-002 user-003 etc. This is exactly the case where Delta encoding excels. Wherever we can partition our keys such that lexically close keys are positioned next to each other we see massive gains.
	The trade off, here, is that in order to decode a key you need everything before it. That's a huge cost to pay since that's completely linear.
        That's why we layer on restart points-- it's a bit lossy but it allows us to avoid having to pay for that linear scan in every situation.
      </p>

      <figure class="wt-figure">
        <img src={img('key_value_pair.png')} alt="Key-value pair structure" />
        <figcaption>Key-value pair structure: shared_bytes, unshared_bytes, value_bytes, key_delta, value.</figcaption>
      </figure>

      <details class="math-block">
        <summary>The math — expected savings</summary>
        <p>{math.deltaSavings}</p>
        <p class="math-takeaway">The real win is in skewed-prefix workloads — timestamps, path-like keys — where delta encoding approaches a small constant. On purely random keys it's a rounding error.</p>
      </details>
    </div>

    <div class="subpart">
      <div class="subpart-kicker">Optimization · C</div>
      <h3>Restart points</h3>
      <p class="placeholder" data-slot="restart-take">
	Every 10th key is a 'restart' point. That means we purposefully break the delta run encoding and allow the key to be full one.
	Honestly, 10 is a magic number-- this is a variable that can be tuned. I would expect a Bigger restart number to conserve more space at the cost of a lookup penalty, vice versa otherwise.
	One way to think about this is that we're trading 10% space overhead (1 out of every 10 keys) for the chance to turn a block scan into O(R).
      </p>

      <figure class="wt-figure">
        <img src={img('restart_points.png')} alt="Restart points" />
        <figcaption>Restart points, one every 10 keys — bounded-cost block search.</figcaption>
      </figure>
    </div>

    <div class="subpart">
      <div class="subpart-kicker">Optimization · D</div>
      <h3>Page hash index</h3>
      <p class="placeholder" data-slot="hash-take">
	Here we have a 256-slot 8bit hash table that exists on top of the restart. Lookups hash -> check -> and if there's a hit, find the run encoded block directly.
	If it fails, or there is a collision (i.e. two keys collide when they get inserted) the slot gets cancelled, and we just binary search over the restart pointers. 
	This optimization seems like the one that is the least important-- all of these checks are L1 resident so honestly I would be surprised if this optimization saves a few nanoseconds if that. 
	This was honestly an optimization that I wrote because I could, and time would have been better spent on the compaction algorithm to be quite honest. 
      </p>

      <figure class="wt-figure">
        <img src={img('page_hash_index.png')} alt="Page hash index" />
        <figcaption>Page hash index — 8-bit slots over restart points, with graceful fallback on collision.</figcaption>
      </figure>

      <details class="math-block">
        <summary>The math — collision analysis</summary>
        <p>{math.collisionAnalysis}</p>
        <p>{math.collisionConclusion}</p>
        <p class="math-takeaway">60% O(1), 40% O(log R). The real value is consistent latency, not headline throughput.</p>
      </details>
    </div>

    <aside class="aside">
      <div class="aside-label">what I'd change about the sstable</div>
      <div class="aside-body" data-slot="sstable-change">
        <p>Stratos began the semester with the idea that every layer you traverse in the memory hierarchy is orders of magnitude slower. Retrieving something from l1 vs on disk is equivalent to walking 50m vs taking a space shuttle to pluto. Big deal, also pretty straightforward.</p>
        <p>Honestly, due to inexperience, I believe my implementation was materializing too much of the sstable in memory. I would redesign to make sure the footers-in-ram were cheaply loadable and I'd remove any sort of copy semantics that were used. I would also overlay additional zlib compression on the delta encoded sections of the sstable and really lean into the 8-bit hash table and these footers so I could increase the operational intensity of the system.</p>
        <p>The bigger mistake was starting top-down. The first version was a gRPC server wrapped around an in-memory hashmap — which got me over the cold-start problem, but locked in interface decisions that outlasted their reason for existing. I should've started with I/O and built upward. More on that in another post.</p>
      </div>
    </aside>
  </section>

  <section class="part">
    <div class="part-kicker">Design · 02</div>
    <h2>Memtable: double-buffered vec → lock-free skiplist</h2>

    <div class="prose" data-slot="memtable-take">
      <p>A memtable is a fast in-memory buffer that you can store write operations inside of before writing them to disk in the form of an sstable. It also serves as a cache-- we tend to see great 'read' performance from memtables because it is not uncommon to read values relatively soon after they have been written. This thesis holds for SSTables as well-- we tend to be more comfortable paying more to retrieve values that are 'older' in terms of how long ago they were stored.</p>

      <p>The simplest form of a memtable is a vector that you shove things into. Great for an initial uncomplicated start. Not so great for performance.</p>

      <p>When the vector fills up, whatever's inside of it gets turned into an sstable. SSTables are sorted string tables... so that takes time cuz you have to sort them. A natural next step for me was to just keep a second buffer around so I could flip them. Something like a primary and secondary-- when primary is close to full i can swing the pointers and flush to disk.</p>

      <p>This is a technique that they use in video game programming with swap chains. When rendering, one frame is getting painted and the other frame is being streamed into a backing buffer and they swap. I thought I was onto something by cannibalizing my internal representation of double buffering.</p>

      <p>Yeah. That really didn't scale very well. There was a lot of memory contention between different threads trying to write to the same buffer, and synchronization was very expensive under load. And then I discovered the skip list. If you were following my simplicity tangent from earlier-- this is one of those moments where choosing the right tool, for the perfect job, results in a simpler implementation. Instead of jamming a bunch of overhead to get my vector backed memtable to work and be performant, using crossbeam's skiplist-- a battle tested datastructure, pretty much allowed me to remove a significant amount of code and get writes to be screaming fast. It's exactly the right primitive for concurrent inserts and it's already sorted so it makes flushing streamable.</p>

      <p>So, the lesson I took away: earn the abstraction. Earn the data structure-- it's true that when you pick the right datastructure, the algorithm that gets used naturally optimizes itself. This is one of those cases.</p>
    </div>

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
	The memtable array was something that persisted because of contention problems that, just like the GRPC semantics that also stuck around without needing to. Instead of designing a proper flush protocol, I had something that worked and decided to just keep going with it. I didn't realize that I was effectively building something close to a ring buffer under load.
	Something that the astute reader may notice is that there's no mention of a WAL (write ahead log). These memtables were not durable at all, and having a WAL would solve that and most likely force a proper flush protocol that's more sophisticated than 'buffer almost full -> allocate new array.' 
	To summarize, I would go back and design in the WAL for both durability concerns, but also because it would be able to buffer writes whilst flushing and allow the memtable to catch up afterwards.
      </p>
    </aside>
  </section>

  <section class="part">
    <div class="part-kicker">Design · 03</div>
    <h2>Bloom filters + fence pointers</h2>

    <p class="placeholder" data-slot="bloom-take">
      In Monkey, it's posited that the bloom filter memory budget should be roughly proportional to the volume of data in the level.
      Thus, bigger levels get more bits, smaller levels get less bits.
      Pair this with Fence Pointers? suddenly there's a large portion of the Get workload that incurs on average 1 disk read. This is important because the main drawback to LSMs is that they are highly optimized for write workloads, and read performance typically sucks. With these optimizations however, we gain a cheap way to recover tons of performance on the Get data path.
    </p>

    <figure class="wt-figure">
      <img src={img('bloomer.png')} alt="Bloom filter size vs 1M GET latency" />
      <figcaption>10⁻¹ = 100K bits. The curve flattens fast — most of the benefit is already there by ~1 bit/key.</figcaption>
    </figure>

    <details class="from-paper">
      <summary>From the paper</summary>
      <p>Each SSTable has an in-memory bloom filter. On a GET, we query the filter first — if it says "not present," we skip that SSTable entirely with zero disk I/O. Bits are distributed across LSM levels proportional to data volume (Monkey-inspired), giving larger lower-level tables more bits per key.</p>
      <p>Paired with a sparse fence-pointer array (first key of each 4 KB block) that fits comfortably in RAM, most GETs incur at most one block read — and many incur none. In large-scale tests, overall CPU cache miss rates stayed in the 3–8% range.</p>
    </details>

    <aside class="aside">
      <div class="aside-label">the curve to remember</div>
      <div class="aside-body" data-slot="bloom-curve">
        <p>Going from <strong>100K → 1M bits</strong> (roughly 0.1 → 1 bit/key) saves about <strong>8%</strong> on 1M GETs. Going from <strong>1M → 10M bits</strong> (1 → 10 bits/key) only saves another <strong>~4%</strong> on top of that.</p>
        <p>The knee is around <strong>1 bit/key</strong>. Anything past that point isn't quite worth it as the false positive rate is already low enough that the cost of an extra check is dominated by other things.</p>
      </div>
    </aside>
  </section>

  <section class="part">
    <div class="part-kicker">Design · 04</div>
    <h2>Compaction — the golden ratio</h2>

    <div class="prose" data-slot="compaction-take">
      <p>{math.compactionTake}</p>
    </div>

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
      At 1M inserts the skiplist is barely faster than the vec, but at 10M it's 5× faster. When you have scaling that itself is a function of total work, it naturally helps to introduce the notion of strong scaling. In summary, as we handed the vector more work, it lost ground against the skiplist in both wall clock time and relative throughput.  More on that in another essay-- but now, just know that the skiplist was the single decision that led to the most improvements and it's also the simplest.    </p>
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
    <h2>Retrospective</h2>

    <aside class="aside">
      <div class="aside-label">what I'd cut</div>
      <p class="placeholder" data-slot="retro-cut">
        The Mixed-1M experiment, which enabled rayon partway through and confounded the skiplist-vs-vec comparison. Also the future-work bullets at the end of the paper — that should've been a roadmap with priorities, not a list of ideas.
      </p>
    </aside>

    <aside class="aside">
      <div class="aside-label">what a v2 would look like</div>
      <p class="placeholder" data-slot="retro-v2">
        In no particular order: a WAL for durability, a real multi-threaded compaction scheduler instead of rayon-over-a-flat-list, and probably killing the page hash index entirely in favor of spending that memory on tighter bloom filters.
      </p>
    </aside>

    <aside class="aside">
      <div class="aside-label">what I learned</div>
      <p class="placeholder" data-slot="retro-learned">
        The skiplist win wasn't clever algorithm work... Honestly it was the opposite; I removed all of the cleverness I engineered because I was chasing Big-O. Picking the primitive that matched the access pattern literally eliminated 15% of the LOC (dumb metric) and considerably sped up the system. 
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

  .hook .lede {
    font-family: var(--serif);
    font-weight: 500;
    color: var(--text-bright);
    letter-spacing: 0.01em;
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

  .readpath-steps {
    list-style: none;
    padding: 0;
    margin: 28px 0 0;
    counter-reset: step;
  }

  .readpath-steps > li {
    position: relative;
    padding: 20px 0 20px 0;
    border-top: 1px dashed var(--border);
  }

  .readpath-steps > li:first-child {
    border-top: none;
  }

  .step-header {
    display: flex;
    align-items: baseline;
    gap: 14px;
    margin-bottom: 10px;
    font-family: var(--serif);
    font-size: 1.05rem;
    color: var(--text-bright);
  }

  .step-num {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: 1px solid var(--accent);
    border-radius: 50%;
    color: var(--accent);
    font-family: var(--serif);
    font-size: 0.85rem;
    font-weight: 500;
    flex-shrink: 0;
    align-self: center;
  }

  .step-header strong {
    font-weight: 500;
  }

  .readpath-steps .placeholder {
    margin-left: 42px;
    margin-top: 0;
    font-size: 0.98rem;
  }

  .subpart {
    margin-top: 56px;
    padding-top: 36px;
    border-top: 1px dashed var(--border);
  }

  .subpart h3 {
    font-family: var(--serif);
    font-weight: 400;
    font-style: italic;
    font-size: 1.3rem;
    color: var(--text-bright);
    letter-spacing: -0.01em;
    margin: 0 0 18px;
  }

  .subpart-kicker {
    font-size: 0.66rem;
    color: var(--accent);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    margin-bottom: 6px;
    opacity: 0.75;
  }

  .math-takeaway {
    margin-top: 14px !important;
    padding-top: 12px;
    border-top: 1px dashed var(--border);
    font-family: var(--serif) !important;
    font-style: italic;
    font-size: 0.88rem !important;
    color: var(--text-bright) !important;
  }

  .part:not(:last-of-type)::after {
    content: '✦  ✦  ✦';
    display: block;
    text-align: center;
    color: var(--accent);
    font-size: 0.78rem;
    letter-spacing: 0.4em;
    margin: 40px 0 -40px;
    opacity: 0.35;
  }

  .part {
    border-bottom: none;
  }

  .pullquote {
    font-family: var(--serif);
    font-style: italic;
    font-size: 1.35rem;
    line-height: 1.45;
    color: var(--text-bright);
    text-align: center;
    margin: 36px auto;
    padding: 22px 32px;
    max-width: 560px;
    border-top: 1px solid var(--accent-dim);
    border-bottom: 1px solid var(--accent-dim);
    position: relative;
  }

  .pullquote::before {
    content: '“';
    position: absolute;
    top: 2px;
    left: 12px;
    font-size: 2.6rem;
    color: var(--accent);
    line-height: 1;
    font-style: normal;
    opacity: 0.5;
  }

  .pullquote::after {
    content: '”';
    position: absolute;
    bottom: -16px;
    right: 12px;
    font-size: 2.6rem;
    color: var(--accent);
    line-height: 1;
    font-style: normal;
    opacity: 0.5;
  }

  .pullquote cite {
    display: block;
    font-style: normal;
    font-size: 0.8rem;
    color: var(--text-dim);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-top: 14px;
  }

  .placeholder {
    font-family: var(--serif);
    font-size: 1.02rem;
    line-height: 1.75;
    color: var(--text-bright);
    margin: 0 0 1.1em;
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
    margin: 32px 0;
    padding: 22px 26px 22px 28px;
    border-left: 3px solid var(--accent);
    background: rgba(184, 151, 126, 0.045);
    border-radius: 0 4px 4px 0;
    position: relative;
  }

  .aside::before {
    content: '';
    position: absolute;
    top: 0;
    right: 0;
    width: 40px;
    height: 40px;
    background: linear-gradient(
      135deg,
      transparent 50%,
      var(--accent-dim) 50%,
      var(--accent-dim) 52%,
      transparent 52%
    );
    opacity: 0.4;
    pointer-events: none;
  }

  .aside-label {
    font-family: var(--serif);
    font-style: italic;
    font-size: 0.8rem;
    color: var(--accent);
    letter-spacing: 0.04em;
    text-transform: none;
    margin-bottom: 14px;
  }

  .aside-label::before {
    content: '※  ';
    font-style: normal;
    opacity: 0.7;
  }

  .aside p {
    margin: 0;
  }

  .aside-body p {
    font-family: var(--serif);
    font-size: 1rem;
    line-height: 1.75;
    color: var(--text-bright);
    margin: 0 0 1em;
  }

  .aside-body p:last-child {
    margin-bottom: 0;
  }

  .tangent {
    margin: 1.1em 0;
  }

  .tangent summary {
    font-family: var(--serif);
    font-style: italic;
    font-size: 0.92rem;
    color: var(--text-dim);
    cursor: pointer;
    list-style: none;
    user-select: none;
    display: inline-block;
    border-bottom: 1px dashed var(--text-dim);
    padding-bottom: 2px;
    transition: color 0.2s, border-color 0.2s;
  }

  .tangent summary::-webkit-details-marker {
    display: none;
  }

  .tangent summary::before {
    content: '↳ ';
    color: var(--accent);
    font-style: normal;
  }

  .tangent summary:hover {
    color: var(--text-bright);
    border-bottom-color: var(--accent);
  }

  .tangent[open] summary {
    margin-bottom: 14px;
  }

  .tangent p {
    font-family: var(--serif);
    font-size: 1.02rem;
    line-height: 1.75;
    color: var(--text);
    margin: 0 0 1.1em;
  }

  .tangent p:last-child {
    margin-bottom: 0;
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

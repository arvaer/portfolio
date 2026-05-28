<script>
  import { onMount } from 'svelte';

  const img = (name) => `/writing/ghostly/images/${name}`;

  // -----------------------------------------------------------------------
  // Code snippets — kept as raw strings so we don't have to fight escaping.
  // -----------------------------------------------------------------------

  const code = {
    warp: `// 1. Each lane evaluates the predicate independently.
bool found = (distance < cutoff_sq);
unsigned active = __activemask();
unsigned voters = __ballot_sync(active, found);
int n_voters    = __popc(voters);

// 2. Lowest active lane is leader; reserves n_voters consecutive slots
//    in the global output with one atomicAdd, broadcasts the base back.
int leader = __ffs(active) - 1;
int base   = 0;
if (lane == leader) base = atomicAdd(pair_count_d, n_voters);
base = __shfl_sync(active, base, leader);

// 3. Each found lane computes its unique offset by popcounting the bits
//    of \`voters\` below its own lane index. No collisions, no gaps.
int offset = __popc(voters & ((1u << lane) - 1));
int slot   = base + offset;

// 4. Coalesced stores — adjacent lanes write to adjacent slots.
if (found) {
    i_d[slot] = pi;
    j_d[slot] = pj;
    disp_d[3*slot]     = ddx;
    disp_d[3*slot + 1] = ddy;
    disp_d[3*slot + 2] = ddz;
}`,

    twoPass: `for (int j = begin; j < end; j += LANES) {
    const int n_lanes = std::min<int>(LANES, end - j);
    const __mmask8 tail_mask = (1u << n_lanes) - 1;

    __m512d v_xj = _mm512_maskz_loadu_pd(tail_mask, &x_sorted[j]);
    __m512d v_yj = _mm512_maskz_loadu_pd(tail_mask, &y_sorted[j]);
    __m512d v_zj = _mm512_maskz_loadu_pd(tail_mask, &z_sorted[j]);
    __m256i v_j_idx = _mm256_maskz_loadu_epi32(tail_mask, &cell_particle[j]);

    const __m512d v_dx = _mm512_sub_pd(v_xj, v_xi);
    const __m512d v_dy = _mm512_sub_pd(v_yj, v_yi);
    const __m512d v_dz = _mm512_sub_pd(v_zj, v_zi);
    __m512d v_r2 = _mm512_mul_pd(v_dx, v_dx);
    v_r2 = _mm512_fmadd_pd(v_dy, v_dy, v_r2);
    v_r2 = _mm512_fmadd_pd(v_dz, v_dz, v_r2);

    __mmask8 mask = _mm512_cmp_pd_mask(v_r2, v_cutoff, _CMP_LT_OQ);
    mask &= tail_mask;
    mask &= ~_mm256_cmpeq_epi32_mask(v_i_bc, v_j_idx);  // exclude self

    // Pass 2: compressed-store — only mask=1 lanes are written, packed.
    _mm256_mask_compressstoreu_epi32(out_j + base + n_matches, mask, v_j_idx);
    _mm512_mask_compressstoreu_pd(sc_dx.data() + n_matches, mask, v_dx);
    _mm512_mask_compressstoreu_pd(sc_dy.data() + n_matches, mask, v_dy);
    _mm512_mask_compressstoreu_pd(sc_dz.data() + n_matches, mask, v_dz);

    n_matches += __builtin_popcount(mask);
}`,

    cupyLaunch: `@lru_cache(maxsize=1)
def _load_module():
    """Compile the .cu source via NVRTC. Cached for the process lifetime."""
    code = _KERNEL_PATH.read_text()
    return _cp.RawModule(
        code=code,
        options=("-std=c++17", "-arch=sm_120", "-lineinfo"),
        backend="nvrtc",
    )


def neighbor_list_cuda_warp(positions, cutoff, ghost_positions,
                            max_neighbors_per_atom=512):
    mod = _load_module()
    # ... copy positions to device, compute cell-grid dims ...

    # 1) Histogram: count atoms per cell.
    assign_cells_p = mod.get_function("assign_cells")
    assign_cells_p((blocks, 1, 1), (threads, 1, 1), (...))

    # 2) Scan: prefix-sum the counts to get per-cell offsets.
    #    cp.cumsum dispatches to CUB's DeviceScan under the hood — no
    #    hand-rolled reduce/scan kernel needed.
    cell_start_d = _cp.zeros(n_cells + 1, dtype=np.int32)
    cell_start_d[1:] = _cp.cumsum(cell_count_d)

    # 3) Scatter: place atoms into their cells using atomic cursors.
    scatter_p = mod.get_function("scatter_particles")
    scatter_p((blocks, 1, 1), (threads, 1, 1), (...))

    # 4) Pair search: one warp per atom, 4 warps per block.
    warp_threads    = 128
    warps_per_block = warp_threads // 32
    warp_blocks     = (n_total + warps_per_block - 1) // warps_per_block

    get_pairs_warp_p = mod.get_function("get_pairs_warp")
    get_pairs_warp_p(
        (warp_blocks, 1, 1),
        (warp_threads, 1, 1),
        (sorted_x_d, sorted_y_d, sorted_z_d,
         np.int32(n_local), np.int32(n_total),
         np.float64(cutoff * cutoff), np.float64(inv_cell),
         np.float64(min_x), np.float64(min_y), np.float64(min_z),
         np.int32(nx), np.int32(ny), np.int32(nz),
         cell_start_d, sorted_indices_d,
         i_d, j_d, disp_d,
         pair_count_d, np.int32(max_pairs)),
    )`
  };

  // -----------------------------------------------------------------------
  // Lazy-load Prism for syntax highlighting (mirrors how Byron loads KaTeX).
  // -----------------------------------------------------------------------

  let codeRoot;

  onMount(() => {
    const PRISM_CSS = 'https://cdn.jsdelivr.net/npm/prismjs@1.29.0/themes/prism-tomorrow.min.css';
    const PRISM_CORE = 'https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-core.min.js';
    const PRISM_AUTOLOADER = 'https://cdn.jsdelivr.net/npm/prismjs@1.29.0/plugins/autoloader/prism-autoloader.min.js';

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

    ensureStylesheet(PRISM_CSS);

    (async () => {
      try {
        await loadScript(PRISM_CORE);
        if (window.Prism) {
          window.Prism.plugins = window.Prism.plugins || {};
          window.Prism.plugins.autoloader = window.Prism.plugins.autoloader || {};
          window.Prism.plugins.autoloader.languages_path =
            'https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/';
        }
        await loadScript(PRISM_AUTOLOADER);
        if (window.Prism && codeRoot) {
          window.Prism.highlightAllUnder(codeRoot);
        }
      } catch (err) {
        console.error('prism load failed', err);
      }
    })();
  });
</script>

<svelte:head>
  <title>ghostly-runs — a walkthrough · arvaer</title>
  <meta
    name="description"
    content="A walkthrough of ghostly-runs: optimizing and benchmarking neighbor-list construction across serial AVX-512, OpenMP, MPI, CUDA, and productivity-language backends on the Harvard HUIT cluster."
  />
</svelte:head>

<div class="walkthrough" bind:this={codeRoot}>
  <nav class="top-nav">
    <a href="/">← back</a>
    <span class="top-nav-sep">/</span>
    <a href="/">writing</a>
    <span class="top-nav-sep">/</span>
    <span class="top-nav-current">ghostly-runs</span>
  </nav>

  <header class="wt-header">
    <div class="wt-eyebrow">walkthrough</div>
    <h1>ghostly-runs</h1>
    <div class="wt-subtitle">
      Optimizing and benchmarking <em>ghostly-neighbors</em> for neighbor-list construction.
    </div>
    <div class="wt-meta">
      <span>CS2050 · Harvard · Spring 2026</span>
    </div>
  </header>

  <section class="hook">
    <p>
      <span class="lede">Molecular dynamics simulations spend most of their wall clock inside one tiny subroutine: neighbor list construction.</span>
      Given <em>N</em> atoms and a cutoff radius <em>r<sub>c</sub></em>, find every pair <em>(i, j)</em> with distance <em>d(i,j) &lt; r<sub>c</sub></em>. The naïve all-pairs version is O(N²); the standard fix is a <strong>cell-list</strong>, which partitions space into cells of side ≥ <em>r<sub>c</sub></em> and reduces the search to the 27 neighboring cells per atom — expected O(N).
    </p>
    <p class="hook-tail">
      In this report, I take this one algorithm and walk it through five parallelization regimes: serial C++ with hand-rolled AVX-512 intrinsics, OpenMP shared-memory threading, MPI distributed-memory decomposition, CUDA dispatched via CuPy/NVRTC with hand-written CUDA C++ kernels, and a "productivity language" comparison using Numba, JAX, and Kokkos. All backends are verified against a common reference and benchmarked on the Harvard HUIT cluster.
    </p>
  </section>

  <section class="part">
    <div class="part-kicker">The recipe</div>
    <h2>The algorithm</h2>

    <div class="prose">
      <p>Four stages, used in every backend:</p>
    </div>

    <ol class="readpath-steps">
      <li>
        <div class="step-header">
          <span class="step-num">1</span>
          <strong>Cell assignment.</strong>
        </div>
        <p>Each atom maps to a 3D grid cell of side length <em>r<sub>c</sub></em>.</p>
      </li>

      <li>
        <div class="step-header">
          <span class="step-num">2</span>
          <strong>Cell-list construction.</strong>
        </div>
        <p>Histogram → scan → scatter type algorithm to construct the stencil.</p>
      </li>

      <li>
        <div class="step-header">
          <span class="step-num">3</span>
          <strong>Pair search.</strong>
        </div>
        <p>For each owned atom <em>i</em>, walk the 3×3×3 cell stencil, compute squared distances, accept pairs below <em>r<sub>c</sub>²</em>.</p>
      </li>

      <li>
        <div class="step-header">
          <span class="step-num">4</span>
          <strong>Output.</strong>
        </div>
        <p>Store <em>(i, j)</em> and <em>d<sub>ij</sub></em>.</p>
      </li>
    </ol>
  </section>

  <section class="part">
    <div class="part-kicker">CPU side</div>
    <h2>AVX-512, OpenMP, and the perf-driven two-pass</h2>

    <div class="prose">
      <p>The serial baseline is a brute-force O(N²) loop and comes in two flavors: generic and SIMD. On its own, the SIMD version is a flat ~2× performance improvement.</p>

      <p>The cell-list version threaded with OpenMP is where it gets interesting. The first attempt was a single-pass kernel: each thread grew a <code>std::vector</code> of pairs as it walked the stencil. This <code>perf</code> profile is what the kernel looked like before:</p>
    </div>

    <figure class="wt-figure">
      <img src={img('perf_fused_before.png')} alt="perf profile of the fused kernel" />
      <figcaption>53.7% of cycles inside <code>neighbor_list_serial</code>, dominated by <code>std::vector::push_back</code> reallocation paths (~35% <code>push_back</code>, ~7% <code>emplace_back</code>, ~6% <code>_M_realloc_insert</code>).</figcaption>
    </figure>

    <div class="prose">
      <p>The kernel was spending most of its time <strong>moving memory around</strong>, not computing distances. The working point showed 108k atoms at 12 Å cutoff → ~68.8M pairs × 32 B = 2.2 GB final storage, so <code>std::vector</code>'s doubling-realloc strategy moved roughly 2× that — ~4.4 GB shuffled per neighbor-list construction, every MD step.</p>

      <p>The fix is a <strong>two-pass kernel</strong>: pass 1 calculates counts per atom and a subsequent serial prefix sum produces exact <code>offsets[i]</code>, pass 2 walks the same cells and <em>compress-stores</em> into pre-allocated NumPy arrays at known offsets. This eliminates the reallocations that were thrashing the cache performance. The serial prefix sum is an unexplored optimization opportunity.</p>
    </div>

    <figure class="wt-figure">
      <img src={img('perf_two_pass_after.png')} alt="perf profile after two-pass optimization" />
      <figcaption>Same simulation, two-pass kernel. The neighbor list is now <strong>0.38%</strong> of cycles. BLAS and the Numba-JIT LJ potential dominate. ~140× reduction in the kernel's share of runtime.</figcaption>
    </figure>

    <div class="prose">
      <p>Moving to a two-pass algorithm, despite the perceived wastefulness of an additional pass, contains the entire optimization story for this algorithm — minimize memory movement.</p>
    </div>

    <div class="subpart">
      <div class="subpart-kicker">The hot loop</div>
      <h3>Two-pass with AVX-512 compress-store</h3>
      <p class="placeholder">
        The inner loop of the two-pass kernel is the same body in both passes — pass 1 popcounts the matched lanes into <code>pair_counts[i]</code>, pass 2 reuses an exact-match cell traversal to compress-store the <em>j</em> indices and displacements directly into the pre-allocated NumPy arrays at <code>offsets[i]</code>. The crucial detail is that pass 2 never allocates: <code>_mm512_mask_compressstoreu_*</code> writes only the lanes whose mask bit is set, packed contiguously, into a destination already sized by the prefix sum.
      </p>

      <pre class="codeblock"><code class="language-cpp">{code.twoPass}</code></pre>

      <ul class="bullet-prose">
        <li><strong>Tail masking instead of a scalar epilogue.</strong> <code>_mm512_maskz_loadu_pd</code> zeros out lanes outside <code>n_lanes</code>, so the same vector body handles partial cells without a separate scalar tail loop. The <code>PAD_SENTINEL</code> coordinates ensure those zeroed lanes can never satisfy the cutoff predicate.</li>
        <li><strong>Self-exclusion via <code>~cmpeq</code> on the index lane.</strong> <code>v_j_idx</code> carries the original particle index for each lane; AND-ing the cutoff mask with the negation of <code>(v_i_bc == v_j_idx)</code> removes the <em>(i, i)</em> self-pair without a branch.</li>
        <li><strong>Compress-store is the entire two-pass payoff.</strong> Pass 1 computes <code>pair_counts[i] = popcount(mask)</code> summed over all 27 cells; the prefix sum produces <code>offsets[i]</code>; pass 2 walks the <em>exact same</em> cell sequence, so <code>n_matches</code> per atom converges to <code>pair_counts[i]</code> and the writes land at disjoint slices of the global output. No allocator. No per-thread vector. No realloc.</li>
      </ul>
    </div>

    <div class="subpart">
      <div class="subpart-kicker">CPU benchmark</div>
      <h3>Backends and scaling</h3>

      <figure class="wt-figure">
        <img src={img('benchmark_cpu.png')} alt="CPU benchmark" />
        <figcaption>Runtime vs. atom count for all CPU backends at five cutoffs. The naïve O(N²) kernels diverge from the cell-list ones beyond ~1000 atoms; Kokkos has ~7 ms constant overhead but matches at large N; Numba is competitive at small N and falls behind at large N due to less aggressive SIMD utilization.</figcaption>
      </figure>

      <p class="prose">Strong-scaling on 108k atoms:</p>

      <figure class="wt-figure">
        <img src={img('neighbor_list_strong.png')} alt="Strong scaling" />
        <figcaption>Strong scaling of <code>cpp_binned_avx512_two_pass</code> on 108,000 atoms, cutoff = 5.0 Å. Dashed line shows ideal linear speedup.</figcaption>
      </figure>

      <table class="wt-table">
        <thead>
          <tr><th>threads</th><th>time (ms)</th><th>speedup</th><th>efficiency</th></tr>
        </thead>
        <tbody>
          <tr><td>1</td><td>201.7</td><td>1.00×</td><td>100%</td></tr>
          <tr><td>8</td><td>31.0</td><td>6.51×</td><td>81%</td></tr>
          <tr><td>16</td><td>18.8</td><td>10.74×</td><td>67%</td></tr>
          <tr><td>24</td><td>15.5</td><td><strong>12.98×</strong></td><td>54%</td></tr>
        </tbody>
      </table>

      <div class="prose">
        <p>The cliff above 16 threads is DRAM bandwidth saturation on the single socket. Critically, parallelizing the <strong>cell-list build phase</strong> (not just the pair search) was what made this work — without it, Amdahl's law capped speedup at ~1.13×. Weak scaling tells the same story:</p>
      </div>

      <figure class="wt-figure">
        <img src={img('neighbor_list_weak.png')} alt="Weak scaling" />
        <figcaption>Weak scaling efficiency (~10,000 atoms per thread, cutoff = 5.0 Å). Ideal weak scaling would maintain efficiency = 1.0.</figcaption>
      </figure>

      <p class="prose">83% efficiency at 2 threads, 65% at 4, 49% at 8, 51% at 16, 25% at 24. Mostly clean through 16, then communication and prefix-sum costs catch up.</p>
    </div>
  </section>

  <section class="part">
    <div class="part-kicker">GPU side</div>
    <h2>Same same, but different stalls</h2>

    <div class="prose">
      <p>The CUDA kernel is dispatched via CuPy's <code>RawModule</code> (NVRTC) — point at a <code>.cu</code> file, get a compiled kernel. The advantage of CuPy is iteration speed; the wrapper looks like NumPy code with a few <code>.get_function(...)</code> calls and the prefix-scan step is just <code>cp.cumsum</code> (CUB under the hood).</p>

      <p>The kernel went through three iterations, each driven by Nsight Compute:</p>
    </div>

    <ul class="bullet-prose">
      <li><strong>Naive (one thread per atom).</strong> SM throughput 53.7%, IPC 0.42, 57% uncoalesced sectors, <strong>84% of warp cycles stalled at CTA barriers</strong>. Latency-bound.</li>
      <li><strong>Tiled with shared memory.</strong> Loaded cell segments into shared tiles before the distance check. Memory throughput up to 23.8%, uncoalesced down to 35% — but barriers still 84% of stall cycles, because warps idled at <code>__syncthreads()</code> waiting for slow lanes. Net win was modest.</li>
      <li><strong>Warp-level primitives.</strong> Replaced <code>__syncthreads()</code> with warp shuffles and ballot intrinsics. One warp per atom (32 lanes), one global atomic per warp instead of one per thread. Walkthrough below.</li>
    </ul>

    <div class="subpart">
      <div class="subpart-kicker">Stage 1 · Naive</div>
      <h3>Latency-bound, barrier-stalled</h3>

      <figure class="wt-figure">
        <img src={img('barrier_stalls_and_access.png')} alt="Nsight diagnostics — naive kernel barrier stalls and uncoalesced accesses" />
        <figcaption>Nsight Compute diagnostics for the naive <code>get_pairs</code> kernel. Uncoalesced global accesses (57% excessive sectors, est. 55% speedup if fixed), FP64/32 utilization warning (64:1 ratio, achieving 16% of FP64 peak), and barrier stalls consuming 83.7% of warp cycles.</figcaption>
      </figure>

      <figure class="wt-figure">
        <img src={img('roofline_nsight.png')} alt="Nsight roofline — naive" />
        <figcaption>Nsight Speed of Light + roofline. SM throughput 53.7%, memory throughput 10.4%. The kernel sits well below the bandwidth ceiling at AI ≈ 1 FLOP/byte. Nsight flags this as a "Latency Issue".</figcaption>
      </figure>
    </div>

    <div class="subpart">
      <div class="subpart-kicker">Stage 2 · Tiled</div>
      <h3>Shared memory tiles, same stalls</h3>

      <figure class="wt-figure">
        <img src={img('tiled_pre_occupancy.png')} alt="Nsight — tiled kernel" />
        <figcaption>Tiled kernel. SM throughput 56%, memory throughput 23.8%, uncoalesced down to 35%. But barrier stalls still dominate (84%) — fast warps idle at <code>__syncthreads()</code> waiting for slow ones.</figcaption>
      </figure>
    </div>

    <div class="subpart">
      <div class="subpart-kicker">Stage 3 · Warp</div>
      <h3>Warp-level primitives, atomics aggregated</h3>

      <figure class="wt-figure">
        <img src={img('launchstats_occu.png')} alt="Nsight — launch stats and occupancy for warp kernel" />
        <figcaption>Launch configuration for the warp kernel. Grid 9,261 blocks × 256 threads, 46 registers/thread, 7.17 KB shared memory/block. Achieved occupancy 80.73% (theoretical 83.33%), with register count as the limiting factor.</figcaption>
      </figure>

      <figure class="wt-figure">
        <img src={img('warp_roofline.png')} alt="Nsight roofline — warp kernel" />
        <figcaption>Final <code>get_pairs_warp</code> kernel. SM throughput <strong>84.3%</strong>, memory throughput 22.0%, IPC 0.82. Nsight reclassifies this as <strong>"High Throughput"</strong>. The FP64 pipeline is now the bottleneck at 84% utilization.</figcaption>
      </figure>

      <figure class="wt-figure">
        <img src={img('warp_base.png')} alt="Nsight summary — warp kernel" />
        <figcaption><code>get_pairs_warp</code> dominates at 925 µs with 84.39% compute throughput. Nsight identifies thread divergence (est. 29% speedup) and non-fused FP64 instructions (est. 29% speedup) as remaining optimization opportunities.</figcaption>
      </figure>

      <figure class="wt-figure">
        <img src={img('warp_workload.png')} alt="Nsight workload — warp kernel" />
        <figcaption>Memory workload and source counters for the warp kernel. Branch efficiency 81.26%, 7,406 divergent branches. Uncoalesced global accesses down to 19% excessive sectors — the L2 hotspots correspond to coordinate loads in the distance-check loop.</figcaption>
      </figure>

      <table class="wt-table">
        <thead>
          <tr><th>metric</th><th>naive</th><th>tiled</th><th>warp</th></tr>
        </thead>
        <tbody>
          <tr><td>SM throughput</td><td>53.7%</td><td>56.0%</td><td><strong>84.3%</strong></td></tr>
          <tr><td>memory throughput</td><td>10.4%</td><td>23.8%</td><td>22.0%</td></tr>
          <tr><td>uncoalesced sectors</td><td>57%</td><td>35%</td><td><strong>19%</strong></td></tr>
          <tr><td>top bottleneck</td><td>barrier stalls</td><td>barrier stalls</td><td><strong>FP64 pipeline</strong></td></tr>
          <tr><td>Nsight class</td><td>Latency Issue</td><td>Latency Issue</td><td><strong>High Throughput</strong></td></tr>
        </tbody>
      </table>

      <div class="prose">
        <p>The arc mirrors the CPU side step-for-step. CPU optimization removed allocator overhead via prefix-summed two-pass writes; GPU optimization removed barrier stalls via warp shuffles. In both cases the headline win came from <strong>eliminating a non-arithmetic stall</strong>, not from finding more FLOPs.</p>

        <p>It's important to note that the cards on the HUIT Cluster (L4's) have nerfed FP64 performance, which comprises the core of the GPU kernels. Follow-on work would see this implemented on an enterprise-class card where full FP64 performance is available.</p>
      </div>
    </div>

    <div class="subpart">
      <div class="subpart-kicker">The single biggest win</div>
      <h3>Warp-aggregated atomic pair counting</h3>

      <p class="placeholder">
        The single biggest GPU win was replacing per-thread atomic appends with one atomic per warp. Phases:
      </p>

      <pre class="codeblock"><code class="language-cuda">{code.warp}</code></pre>

      <div class="prose">
        <p>Two compounding wins: one global atomic per warp (instead of up to 32) reduces L2 contention by ~10×, and the consecutive slots <code>base, base+1, ..., base+n_voters-1</code> let the memory controller coalesce 4-byte stores into wide transactions. At dense-liquid pair densities, the coalescing is usually the larger win.</p>

        <p>Two correctness traps worth flagging: the sync mask must be <code>__activemask()</code>, not <code>0xFFFFFFFF</code> — threads that exited early (<code>if (pi &gt;= n_local) continue</code>) are inactive, and using a full mask when inactive lanes exist is undefined behavior. And the leader must be <code>__ffs(active) - 1</code>, not lane 0, because lane 0 may itself be inactive.</p>
      </div>
    </div>

    <div class="subpart">
      <div class="subpart-kicker">Putting it together</div>
      <h3>The CuPy launch wrapper</h3>

      <p class="placeholder">
        The full CUDA kernel is compiled at runtime via NVRTC, but everything around it is just NumPy-style CuPy code. This is the wrapper for the warp-per-atom variant:
      </p>

      <pre class="codeblock"><code class="language-python">{code.cupyLaunch}</code></pre>

      <div class="prose">
        <p><strong>CUB via <code>cp.cumsum</code>.</strong> The exclusive-scan step that the C++ code writes by hand becomes a one-liner on GPU because CuPy delegates to NVIDIA's CUB library under the covers.</p>
      </div>
    </div>

    <div class="subpart">
      <div class="subpart-kicker">GPU benchmark</div>
      <h3>Single-L4 sweep</h3>

      <figure class="wt-figure">
        <img src={img('benchmark_gpu.png')} alt="GPU benchmark" />
        <figcaption>All single-GPU backends at five cutoffs on the L4. <code>cuda_block</code> and <code>cuda_warp</code> track each other through most of the sweep; <code>cuda_naive</code> lags at small/medium N and catches up at large N as work hides its uncoalesced gathers. JAX is competitive below ~1k atoms then falls off because XLA isn't producing a maximally specialized kernel. <code>kokkos_gpu</code> is missing here — see the framework comparison for the OOM story.</figcaption>
      </figure>
    </div>
  </section>

  <section class="part">
    <div class="part-kicker">MPI scaling</div>
    <h2>Single-node, multi-node, and the cluster being a cluster</h2>

    <div class="prose">
      <p>The provided <code>DistributedParticles</code> class uses a 3D Cartesian topology (<code>MPI.Compute_dims(comm.size, 3)</code> + periodic <code>Create_cart</code>), exchanges ghost atoms across the 26 face/edge/corner neighbors, and accumulates ghost forces back to owners. I built the benchmarking harness around it and ran it across the full grid at 1/2/4 ranks single-node, then 48/96/192 ranks across multiple nodes.</p>

      <p><strong>Note:</strong> for project completion, a C++ MPI implementation containing a simple 2D slab exchange is included. It's not benchmarked in this report, but it lives in the <code>mpi</code> directory with an sbatch script that runs the example to verify correctness.</p>
    </div>

    <div class="subpart">
      <div class="subpart-kicker">CPU intranode</div>
      <h3>Clean scaling, then bandwidth saturation</h3>

      <figure class="wt-figure">
        <img src={img('benchmark_mpi_cpu_n1.png')} alt="CPU MPI 1 rank" />
        <figcaption>CPU MPI sweep at 1 rank — the baseline.</figcaption>
      </figure>

      <figure class="wt-figure">
        <img src={img('benchmark_mpi_cpu_n4.png')} alt="CPU MPI 4 ranks" />
        <figcaption>CPU MPI sweep at 4 ranks (single node). The cell-list curves slide down by ~2× per rank doubling. At 22,800 atoms, 4 ranks hit 3.98× speedup (99% efficiency). Below ~1k atoms the 4-rank curve is communication-bound; at 51,984 atoms it collapses to 1.21× as DRAM bandwidth saturates across the 4 cores.</figcaption>
      </figure>
    </div>

    <div class="subpart">
      <div class="subpart-kicker">CPU multinode</div>
      <h3>Real gains under HPC noise</h3>

      <p class="placeholder">
        Pushing past one node, we ran 48 / 96 / 192 ranks (2 / 4 / 8 nodes × 24 cores) on the HUIT general CPU nodes.
      </p>

      <figure class="wt-figure">
        <img src={img('benchmark_mpi_cpu_n96.png')} alt="CPU MPI 96 ranks" />
        <figcaption>96-rank sweep. The lower envelope keeps dropping with rank count.</figcaption>
      </figure>

      <figure class="wt-figure">
        <img src={img('benchmark_mpi_cpu_n192.png')} alt="CPU MPI 192 ranks" />
        <figcaption>192-rank sweep. The vertical jumps to ~100 ms are the cluster behaving like a cluster.</figcaption>
      </figure>

      <p class="prose">At 14,400 atoms (<code>cpp_binned_avx512_two_pass</code>):</p>

      <table class="wt-table">
        <thead>
          <tr><th>configuration</th><th>ranks</th><th>time</th><th>speedup</th><th>efficiency</th></tr>
        </thead>
        <tbody>
          <tr><td>1 node × 1</td><td>1</td><td>10.95 ms</td><td>1.00×</td><td>100%</td></tr>
          <tr><td>1 node × 24</td><td>24</td><td>0.79 ms</td><td>13.84×</td><td>58%</td></tr>
          <tr><td>2 nodes × 24</td><td>48</td><td>0.44 ms</td><td>24.83×</td><td>52%</td></tr>
          <tr><td>4 nodes × 24</td><td>96</td><td>0.29 ms</td><td>37.19×</td><td>39%</td></tr>
          <tr><td>8 nodes × 24</td><td>192</td><td>0.18 ms</td><td><strong>59.42×</strong></td><td>31%</td></tr>
        </tbody>
      </table>

      <div class="prose">
        <p>Going from 1 to 8 nodes adds another ~4× on top of single-node performance. The same trend holds across the 3k–15k atom sweet spot: 48-rank speedups land in 18–25×, 96-rank in 26–37×, 192-rank in 30–60×.</p>
      </div>
    </div>

    <div class="subpart">
      <div class="subpart-kicker">GPU intranode</div>
      <h3>Structurally lower speedups + 4-rank flakiness</h3>

      <figure class="wt-figure">
        <img src={img('benchmark_mpi_gpu_n4.png')} alt="GPU MPI 4 GPUs" />
        <figcaption>4-GPU sweep, all backends, all cutoffs. CUDA backends scale further but well below 4×; <code>kokkos_gpu</code> (red) shows reproducible vertical excursions an order of magnitude above the trend at multiple atom counts (most pronounced at cutoffs 5.0 and 8.0 Å beyond ~9k atoms).</figcaption>
      </figure>

      <div class="prose">
        <p>Two things to note. First, <code>cuda_warp</code> only reaches 2.67× at 4 GPUs at the largest case — the L4 already runs the kernel in single-digit ms over 300 GB/s of HBM, so per-rank work shrinks fast and inter-GPU PCIe halo exchange becomes a comparable fraction of the step. Halo cost was a rounding error on CPU MPI; here it's half the step. Second, the <code>kokkos_gpu</code> 4-rank spikes are <strong>deterministic</strong> — same atom counts, same spikes, across resubmissions. The most likely cause is the same view-sizing bug that OOMs the non-MPI <code>kokkos_gpu</code> runs (preallocations of 3–4 GB per rank stacking up across 4 ranks on a shared PCIe complex), not transient noise.</p>

        <p>A few cluster-engineering notes. CPU and GPU benchmarks live in separate venvs (<code>ghostly-neighbors/.venv</code> and <code>ghostly-neighbors-gpu/.venv</code>) because the hand-rolled AVX-512 intrinsics SIGILL on the GPU nodes' CPUs. GPU rank-to-device pinning needed a manual <code>.gpu_bind.sh</code> wrapper that sets <code>CUDA_VISIBLE_DEVICES=$OMPI_COMM_WORLD_LOCAL_RANK</code> because OpenMPI doesn't honor <code>--cpus-per-task</code> for GPU pinning here. <code>--gres=gpu:4 --exclusive</code> reserves the full 4×L4 node — but <code>--exclusive</code> is empirically prohibited on HUIT GPU nodes, so the GPUs are contested with other jobs. That contention shows up directly as the visible spikes in the GPU MPI plots.</p>
      </div>

      <aside class="aside">
        <div class="aside-label">GPU multi-node — punted</div>
        <div class="aside-body">
          <p>Omitted due to difficulties building and running the system across multiple GPU nodes. Full account recorded in the <a href="/papers/ghostly-runs.pdf">annotated PDF</a>.</p>
        </div>
      </aside>
    </div>
  </section>

  <section class="part">
    <div class="part-kicker">Framework comparison</div>
    <h2>Hand-tuned C++, productivity frameworks, asymmetric availability</h2>

    <p class="placeholder">
      One timing per backend at ~9,800 atoms / 5.0 Å cutoff. CPU rows use 24 OMP threads; GPU rows are single L4; MPI rows are 2 ranks. Relative-to-fastest computed across the whole table.
    </p>

    <table class="wt-table">
      <thead>
        <tr><th>backend</th><th>device</th><th>time</th><th>vs. fastest</th></tr>
      </thead>
      <tbody>
        <tr><td><strong>cpp_binned_avx512_two_pass</strong></td><td>CPU 24-thr</td><td><strong>0.83 ms</strong></td><td><strong>1.00×</strong></td></tr>
        <tr><td>cpp_binned_avx512_omp_fused</td><td>CPU 24-thr</td><td>1.30 ms</td><td>1.56×</td></tr>
        <tr><td>kokkos_cpu</td><td>CPU 24-thr</td><td>1.49 ms</td><td>1.79×</td></tr>
        <tr><td>numba</td><td>CPU 24-thr</td><td>2.96 ms</td><td>3.55×</td></tr>
        <tr><td>cpp_binned_avx512_two_pass</td><td>2 ranks × CPU</td><td>3.24 ms*</td><td>3.91×</td></tr>
        <tr><td>cuda_block / cuda_warp</td><td>1 × L4</td><td>~3.37 ms</td><td>~4.05×</td></tr>
        <tr><td>kokkos_gpu (MPI)</td><td>2 ranks × L4</td><td>3.89 ms*</td><td>4.69×</td></tr>
        <tr><td>cuda_naive</td><td>1 × L4</td><td>8.42 ms</td><td>10.09×</td></tr>
        <tr><td>jax</td><td>1 × L4</td><td>8.48 ms</td><td>10.17×</td></tr>
        <tr><td>cpp_serial_avx512</td><td>CPU 1-thr</td><td>44.19 ms</td><td>52.97×</td></tr>
        <tr><td>cpp_serial_scalar</td><td>CPU 1-thr</td><td>238.12 ms</td><td>285.43×</td></tr>
        <tr><td><strong>kokkos_gpu (non-MPI)</strong></td><td>1 × L4</td><td><strong>OOM — excluded</strong></td><td>—</td></tr>
        <tr><td><strong>jax (MPI)</strong></td><td>2 × L4</td><td><strong>not supported</strong></td><td>—</td></tr>
      </tbody>
    </table>
    <p class="table-foot">*MPI rows measured at 9,152 atoms (closest sweep point).</p>

    <figure class="wt-figure">
      <img src={img('roofline.png')} alt="Roofline — all backends" />
      <figcaption>Roofline: every backend operates at AI ≈ 0.25–0.6 FLOP/byte, deep in the bandwidth-bound region on both CPU and GPU. The compute knees (CPU ≈ 6.4, GPU ≈ 1.6 FLOPs/byte) are far to the right of the workload, so peak FLOPS are irrelevant — what matters is how efficiently each backend streams coordinate data through the memory hierarchy.</figcaption>
    </figure>

    <div class="prose">
      <p>Two backends have asymmetric availability. <code>kokkos_gpu</code> OOMs on a single L4 — most likely a <code>Kokkos::View</code> extents bug in the implementation — and when the OOM happens <em>under MPI</em> the dying rank never reaches the next <code>MPI_Allreduce</code>, deadlocking the surviving ranks. I excluded it from the single-GPU sweep but kept it on the MPI side, where the per-rank working set fits and it lands at 3.89 ms, comparable to the CUDA backends. JAX is the mirror image: clean on a single L4, but multi-GPU JAX setups are infamously difficult to set up so I punted.</p>
    </div>

    <ul class="bullet-prose">
      <li><strong>Hand-tuned C++ on CPU still wins outright at this size.</strong> 0.83 ms on 24 cores beats the best single-L4 CUDA kernel (3.36 ms) by ~4×. The L4's 300 GB/s is only ~2× the Xeon's 141 GB/s, and this kernel is bandwidth-bound, so the GPU's nominal compute headroom doesn't translate.</li>
      <li><strong>Productivity costs are flat on CPU.</strong> Kokkos lands within 1.8× of hand-tuned, Numba within 3.6×.</li>
      <li><strong>The CUDA progression mirrors the CPU progression.</strong> Naive → block/warp is ~2.5×; CPU <code>omp_fused → two_pass</code> is ~1.6×. Both speedups came from removing a non-arithmetic stall.</li>
    </ul>
  </section>

  <section class="part">
    <h2>Conclusion</h2>

    <ol class="conclusion-list">
      <li><strong>Algorithm dominates.</strong> Cell-lists give orders-of-magnitude speedup over O(N²); SIMD/threading gains are smaller in comparison.</li>
      <li><strong>Amdahl is real.</strong> Serial cell-list construction capped OpenMP at 1.13× until that phase was parallelized too.</li>
      <li><strong>Autovectorization is not a programming model.</strong> Hand-rolled AVX-512 intrinsics buy a consistent ~2× over scalar, both in O(N²) and cell-list kernels.</li>
      <li><strong>GPU optimization is about eliminating stalls.</strong> Barrier stalls were the bottleneck, not arithmetic. Warp shuffles eliminated 84% of stall cycles; the kernel went from "Latency Issue" to "High Throughput" with the FP64 pipeline as the new bottleneck. Same arc as the CPU <code>push_back</code> → two-pass story — different stall, same idea.</li>
      <li><strong>MPI scales until bandwidth saturates.</strong> Single-node 4-rank hits ~99% efficiency at the sweet spot, breaks down at ~50k atoms as DRAM saturates. Multinode buys another ~4× across 8 nodes (192 ranks: 59× over 1 rank). GPU MPI is structurally compressed because the L4 is fast enough that PCIe halo cost is half the step.</li>
      <li><strong>Productivity vs. performance.</strong> Numba ~28% of hand-tuned C++ at this size; Kokkos ~56% with similar simplicity. JAX trails on small problems where XLA dispatch overhead dominates.</li>
    </ol>

    <p class="prose closing">
      The neighbor list is a bandwidth-bound workload at scale — arithmetic intensity stays near 0.4 FLOP/byte regardless of backend. That single property explains why every optimization in this report was about reducing data movement (compress-stores, warp shuffles, on-device prefix sums) rather than about finding more FLOPs.
    </p>
  </section>

  <footer class="wt-footer">
    <a href="/">← back to writing</a>
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

  .wt-meta span {
    opacity: 0.7;
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
    margin: 0 0 1em;
  }

  .hook p.hook-tail {
    font-size: 1.04rem;
    color: var(--text);
    margin-bottom: 0;
  }

  .hook .lede {
    font-family: var(--serif);
    font-weight: 500;
    color: var(--text-bright);
    letter-spacing: 0.01em;
  }

  .part {
    padding: 32px 0 56px;
    margin-bottom: 16px;
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
    font-size: 0.92rem;
    line-height: 1.8;
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

  .prose code,
  .placeholder code,
  .bullet-prose code,
  .conclusion-list code {
    font-family: var(--mono);
    font-size: 0.86em;
    background: rgba(184, 151, 126, 0.08);
    padding: 1px 5px;
    border-radius: 3px;
    color: var(--text-bright);
  }

  .closing {
    margin-top: 28px;
    padding-top: 20px;
    border-top: 1px dashed var(--border);
    font-style: italic;
  }

  .placeholder {
    font-family: var(--serif);
    font-size: 1.02rem;
    line-height: 1.75;
    color: var(--text-bright);
    margin: 0 0 1.1em;
  }

  .readpath-steps {
    list-style: none;
    padding: 0;
    margin: 28px 0 0;
  }

  .readpath-steps > li {
    position: relative;
    padding: 18px 0;
    border-top: 1px dashed var(--border);
  }

  .readpath-steps > li:first-child {
    border-top: none;
  }

  .step-header {
    display: flex;
    align-items: baseline;
    gap: 14px;
    margin-bottom: 8px;
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

  .readpath-steps p {
    margin-left: 42px;
    margin-top: 0;
    font-size: 0.98rem;
    font-family: var(--serif);
    line-height: 1.7;
    color: var(--text);
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
    font-size: 0.78rem;
    color: var(--text-dim);
    text-align: center;
    margin-top: 10px;
    font-style: italic;
    font-family: var(--serif);
    line-height: 1.55;
  }

  .wt-figure figcaption code {
    font-family: var(--mono);
    font-size: 0.85em;
    background: rgba(184, 151, 126, 0.08);
    padding: 1px 4px;
    border-radius: 3px;
    color: var(--text);
    font-style: normal;
  }

  .codeblock {
    margin: 22px 0 26px;
    padding: 18px 20px;
    background: #111418;
    border: 1px solid var(--border);
    border-left: 3px solid var(--accent);
    border-radius: 3px;
    overflow-x: auto;
    font-family: var(--mono);
    font-size: 0.78rem;
    line-height: 1.6;
    color: var(--text);
  }

  .codeblock code {
    font-family: var(--mono);
    font-size: inherit;
    background: transparent;
    padding: 0;
    color: inherit;
    white-space: pre;
  }

  /* Soften prism's default backgrounds so they blend with our theme.
     Token classes are added by Prism at runtime, so they're :global. */
  .codeblock :global(code[class*='language-']) {
    background: transparent !important;
    text-shadow: none !important;
  }

  .codeblock :global(.token.comment) {
    color: #6b6660 !important;
    font-style: italic;
  }
  .codeblock :global(.token.keyword),
  .codeblock :global(.token.builtin) {
    color: #b8977e !important;
  }
  .codeblock :global(.token.string) {
    color: #c9b78d !important;
  }
  .codeblock :global(.token.number) {
    color: #d6b289 !important;
  }
  .codeblock :global(.token.function) {
    color: #e8d4b0 !important;
  }
  .codeblock :global(.token.operator),
  .codeblock :global(.token.punctuation) {
    color: #c8c4bc !important;
  }
  .codeblock :global(.token.macro) {
    color: #b8977e !important;
  }

  .bullet-prose {
    list-style: none;
    padding: 0;
    margin: 18px 0 6px;
  }

  .bullet-prose li {
    position: relative;
    padding-left: 22px;
    margin-bottom: 14px;
    font-family: var(--serif);
    font-size: 1rem;
    line-height: 1.7;
    color: var(--text-bright);
  }

  .bullet-prose li::before {
    content: '→';
    position: absolute;
    left: 0;
    top: 0;
    color: var(--accent);
    font-style: normal;
  }

  .bullet-prose li strong {
    color: var(--text-bright);
    font-weight: 500;
  }

  .conclusion-list {
    list-style: decimal inside;
    padding: 0;
    margin: 18px 0 8px;
  }

  .conclusion-list li {
    font-family: var(--serif);
    font-size: 1rem;
    line-height: 1.75;
    color: var(--text-bright);
    margin-bottom: 14px;
  }

  .conclusion-list li strong {
    color: var(--text-bright);
    font-weight: 500;
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

  .wt-table td strong {
    color: var(--text-bright);
  }

  .table-foot {
    font-size: 0.72rem;
    color: var(--text-dim);
    margin-top: -14px;
    margin-bottom: 24px;
    font-family: var(--serif);
    font-style: italic;
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

  .aside a {
    color: var(--accent);
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 3px;
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

    .codeblock {
      font-size: 0.72rem;
      padding: 14px 14px;
    }

    .hook p {
      font-size: 1.05rem;
    }
  }
</style>

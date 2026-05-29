<script>
  const code = {
    scenario: `(scenario jco-vignette
  (time :start "2026-06-01T00:00:00Z" :stop "2026-06-01T00:10:00Z" :step "60s")
  (entity target
    (state-vector :epoch "2026-06-01T00:00:00Z" :frame GCRF
                  :rv [42164.0 0.0 0.0 0.0 3.0746 0.0]))
  (nmc :name chaser :target target :radius-km 3)
  (conjunction :primary target :secondary chaser :threshold-km 20 :name ca)
  (maneuver target :at "2026-06-01T00:05:00Z" :dv-ric [0.0 0.005 0.0] :name burn)
  (phenomenology target
    (optical :diameter-m 4 :albedo 0.2)
    :name target.phenom)
  (sensor site
    (site :lat-deg 0 :lon-deg 0 :alt-m 0)
    (constraints :min-elevation-deg 5 :max-range-km 45000 :lighting any))
  (observe site :target target :phenomenology target.phenom
           :products (angles vmag) :name obs)
  (photometric-change obs :threshold-mag 0.5 :name flare)
  (tracklets obs :min-count 3 :name tracks)
  (sink truth :from target :format json)
  (sink obs :format json)
  (sink tracks :format json)
  (sink ca-alert :from ca :format json)
  (sink burn-alert :from burn :format json)
  (sink flare-alert :from flare :format json))`,

    graph: `%0 = time_grid time()[start='2026-06-01T00:00:00Z', step='60s', stop='2026-06-01T00:10:00Z'] : TimeGrid
%1 = entity target()[epoch='2026-06-01T00:00:00Z', frame='GCRF', name='target', rv=[42164.0, 0.0, 0.0, 0.0, 3.0746, 0.0], source='state-vector'] : EntitySpec
%2 = propagate target.truth(%1, %0)[model='auto'] : StateBatch
%3 = nmc chaser(%2, %0)[name='chaser', phase_deg=0.0, plane='in-plane', radius_km=3.0] : StateBatch
%4 = conjunction ca(%2, %3)[name='ca', threshold_km=20.0] : EventSet
%5 = maneuver burn(%2)[at='2026-06-01T00:05:00Z', dv_ric=[0.0, 0.005, 0.0], name='burn'] : EventSet
%6 = phenomenology target.phenom(%2)[attributes=['albedo', 'optical_diameter_m'], baseline={'optical_diameter_m': 4.0, 'albedo': 0.2}, name='target.phenom'] : PhenomenologyState
%7 = sensor site()[alt_m=0.0, lat_deg=0.0, lighting='any', lon_deg=0.0, max_range_km=45000.0, min_elevation_deg=5.0, name='site', revisit=None] : SensorSite
%8 = observe_phenom obs(%7, %2, %6)[name='obs', products=['angles', 'vmag']] : ObservationBatch
%9 = photometric_change flare(%8)[name='flare', threshold_mag=0.5] : EventSet
%10 = tracklet tracks(%8)[max_gap=None, min_count=3, name='tracks'] : TrackletSet
%11 = sink truth(%2)[format='json', name='truth'] : SinkSpec
%12 = sink obs(%8)[format='json', name='obs'] : SinkSpec
%13 = sink tracks(%10)[format='json', name='tracks'] : SinkSpec
%14 = sink ca-alert(%4)[format='json', name='ca-alert'] : SinkSpec
%15 = sink burn-alert(%5)[format='json', name='burn-alert'] : SinkSpec
%16 = sink flare-alert(%9)[format='json', name='flare-alert'] : SinkSpec`,

    compiler: `def compile_scenario(source: str | dict[str, Any], fmt: str) -> CompiledScenario:
    compiled = Compiler().compile(source, fmt)
    run_passes(compiled.graph, DEFAULT_PASSES)
    return compiled

class ValidateTypes:
    name = "validate-types"

    def run(self, graph: Graph) -> Graph:
        dtype_of = {op.id: op.dtype for op in graph.nodes}
        for op in graph.nodes:
            spec = spec_for(op.kind)
            if len(op.src) != len(spec.operands):
                raise ScenarioCompileError(...)
            for src_id, expected in zip(op.src, spec.operands):
                actual = dtype_of[src_id]
                if expected != ANY and actual != expected:
                    raise ScenarioCompileError(...)
        return graph`,

    opspec: `OP_SPECS: dict[OpKind, OpSpec] = {
    OpKind.TIME_GRID: OpSpec("TimeGrid", (), NoFrame()),
    OpKind.ENTITY: OpSpec("EntitySpec", (), EntityDeclaredFrame()),
    OpKind.PROPAGATE: OpSpec("StateBatch", ("EntitySpec", "TimeGrid"), PreserveInput(0)),
    OpKind.NMC: OpSpec("StateBatch", ("StateBatch", "TimeGrid"), PreserveInput(0)),
    OpKind.RPO: OpSpec("RelativeStateBatch", ("StateBatch", "StateBatch"), RelateInputs("RIC")),
    OpKind.CONJUNCTION: OpSpec("EventSet", ("StateBatch", "StateBatch"), NoFrame()),
    OpKind.OBSERVE_PHENOM: OpSpec(
        "ObservationBatch", ("SensorSite", "StateBatch", "PhenomenologyState"), NoFrame()
    ),
    OpKind.TRACKLET: OpSpec("TrackletSet", ("ObservationBatch",), NoFrame()),
    OpKind.SINK: OpSpec("SinkSpec", (ANY,), PreserveInput(0)),
}`,

    backend: `class NumpyBackend:
    name = "numpy"

    def execute(self, op: UOp, inputs: tuple[object, ...]) -> object:
        if op.kind == OpKind.TIME_GRID:
            return make_time_grid(op.args["start"], op.args["stop"], op.args["step"])
        if op.kind == OpKind.PROPAGATE:
            return propagate_entity(inputs[0], inputs[1], model=op.args.get("model", "auto"))
        if op.kind == OpKind.NMC:
            return nmc_chaser_truth(op.args["name"], inputs[0], inputs[1], ...)
        if op.kind == OpKind.CONJUNCTION:
            return conjunction_events(inputs[0], inputs[1], op.args["threshold_km"])
        if op.kind == OpKind.OBSERVE_PHENOM:
            return synth_observations(inputs[0], inputs[1], phenom=inputs[2], products=op.args["products"])
        if op.kind == OpKind.SINK:
            return make_sink(op.args["name"], inputs[0], op.args.get("format", "json"))`
  };
</script>

<svelte:head>
  <title>JCO scenario DSL — a work showcase · Prominent Systems</title>
  <meta
    name="description"
    content="A draft work showcase for a JCO scenario DSL: compiler lowering, typed operation graphs, validation passes, and kernel execution."
  />
</svelte:head>

<div class="walkthrough">
  <nav class="top-nav">
    <a href="/">← back</a>
    <span class="top-nav-sep">/</span>
    <a href="/">writing</a>
    <span class="top-nav-sep">/</span>
    <span class="top-nav-current">jco scenario dsl</span>
  </nav>

  <header class="wt-header">
    <div class="wt-eyebrow">work showcase draft</div>
    <h1>JCO scenario DSL</h1>
    <div class="wt-subtitle">A compiler-to-graph runtime for simulated space operations.</div>
    <div class="wt-meta">
      <span>compiler architecture</span>
      <span>·</span>
      <span>astrodynamics kernels</span>
      <span>·</span>
      <span>scenario runtime</span>
    </div>
  </header>

  <section class="hook">
    <p>
      <span class="lede">This project started as a way to avoid writing a new command for every simulated space vignette.</span>
      The fun part is that the answer turned into a little compiler: a Lisp/JSON scenario language that lowers into a typed operation graph, gets checked for domain and frame consistency, and then executes through reusable numerical kernels.
    </p>
  </section>

  <section class="part">
    <div class="part-kicker">The shape</div>
    <h2>A scenario is intent, not implementation</h2>
    <p class="prose">
      The user writes a compact scenario: a target in GEO, an NMC chaser, a conjunction detector,
      a known maneuver, an optical phenomenology stream, a sensor, observations, photometric change
      detection, tracklets, and a handful of sinks. The surface language stays high-level; the compiler
      is responsible for deciding what concrete graph nodes need to exist.
    </p>
    <pre class="codeblock"><code>{code.scenario}</code></pre>
  </section>

  <section class="part">
    <div class="part-kicker">Lowering</div>
    <h2>The compiler turns it into an inspectable graph</h2>
    <p class="prose">
      The lowered graph is the important artifact. Notice how <code>target</code> becomes an entity, then
      gets automatically propagated into <code>target.truth</code> so later forms can consume a
      <code>StateBatch</code>. The observation node becomes <code>observe_phenom</code> because requesting
      <code>vmag</code> requires a phenomenology stream.
    </p>
    <pre class="codeblock"><code>{code.graph}</code></pre>
  </section>

  <section class="part">
    <div class="part-kicker">Contracts</div>
    <h2>Types and frames are checked before kernels run</h2>
    <p class="prose">
      The graph is not just a pretty debug dump. Each op has a declared output dtype, operand signature,
      and frame rule. This kept the language honest as more JCO primitives landed: launch, insertion,
      RPO, transfer surfaces, catalog sets, visualization sinks, and alert products all compose through
      the same registry.
    </p>
    <pre class="codeblock"><code>{code.opspec}</code></pre>
    <pre class="codeblock"><code>{code.compiler}</code></pre>
  </section>

  <section class="part">
    <div class="part-kicker">Execution</div>
    <h2>Kernel lowering is a backend boundary</h2>
    <p class="prose">
      The runtime walks the graph in dependency order and passes typed products into the backend. Today
      the backend is NumPy. The point of the boundary is that scenario semantics do not belong inside
      the numerical implementation: a future pybind, Rust, JAX, or GPU backend should have to match the
      same graph contract.
    </p>
    <pre class="codeblock"><code>{code.backend}</code></pre>
  </section>

  <section class="part">
    <div class="part-kicker">What it can express now</div>
    <h2>The first serious vignettes</h2>
    <ul class="bullet-prose">
      <li><strong>Breakup:</strong> parent truth, deterministic NASA-SBM-style fragments, post-event phenomenology rules.</li>
      <li><strong>Sensor and tracklets:</strong> site constraints, elevation/range/lighting gates, observations, fixed TrackID grouping.</li>
      <li><strong>Phenomenology:</strong> passive RF state, diffuse-sphere visual magnitude, sphere RCS, event-driven mode changes.</li>
      <li><strong>RPO and transfer:</strong> NMC/FMC chaser truth, RIC relative state, CW transfer options ranked by delta-v.</li>
      <li><strong>Launch and intercept:</strong> staged launch, insertion, direct-ascent intercept, and launch-to-GEO-to-RPO graphs.</li>
      <li><strong>Products:</strong> JSON truth, observations, tracklets, EventSet alerts, scene-v1 tracks, and GeoJSON ground tracks.</li>
    </ul>
  </section>

  <section class="part">
    <div class="part-kicker">Notes to expand</div>
    <h2>TODO prose slots</h2>
    <div class="todo-list">
      <p>Write the origin story: why one-off commands were going to explode.</p>
      <p>Add a diagram of parse → lower → validate → execute → sink.</p>
      <p>Show the Phase 6 launch-to-GEO-to-RPO graph and talk about <code>as_state</code>.</p>
      <p>Show the Phase 7 compound acceptance test and the sinks it emits.</p>
      <p>Close with what is next: covariance/Pc rigor, TLE mean-element fitting, attitude/aspect models, RF/TDOA/FDOA.</p>
    </div>
  </section>

  <footer class="wt-footer">
    <a href="/">home</a>
    <span>·</span>
    <a href="/#writing">writing</a>
  </footer>
</div>

<style>
  .walkthrough {
    max-width: 820px;
    margin: 0 auto;
    padding: 48px 24px 96px;
  }

  .top-nav {
    display: flex;
    gap: 10px;
    align-items: center;
    margin-bottom: 56px;
    font-size: 0.78rem;
    color: var(--text-dim);
  }

  .top-nav a {
    color: var(--accent);
    text-decoration: none;
  }

  .top-nav-current {
    color: var(--text);
  }

  .wt-header {
    margin-bottom: 38px;
  }

  .wt-eyebrow,
  .part-kicker {
    font-size: 0.72rem;
    color: var(--accent);
    text-transform: uppercase;
    letter-spacing: 0.12em;
    margin-bottom: 10px;
  }

  .wt-header h1 {
    font-family: var(--serif);
    font-size: 2.55rem;
    font-weight: 400;
    color: var(--text-bright);
    line-height: 1.08;
    margin-bottom: 12px;
  }

  .wt-subtitle {
    font-family: var(--serif);
    font-size: 1.08rem;
    color: var(--text);
    line-height: 1.5;
  }

  .wt-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 9px;
    margin-top: 14px;
    font-size: 0.76rem;
    color: var(--text-dim);
  }

  .hook {
    padding: 30px 0 44px;
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
    margin-bottom: 46px;
  }

  .hook p,
  .prose,
  .todo-list p {
    font-family: var(--serif);
    font-size: 1.04rem;
    line-height: 1.78;
    color: var(--text-bright);
  }

  .lede {
    color: var(--accent);
  }

  .part {
    margin: 0 0 58px;
  }

  .part h2 {
    font-family: var(--serif);
    font-size: 1.55rem;
    font-weight: 400;
    color: var(--text-bright);
    margin-bottom: 16px;
  }

  .prose code,
  .todo-list code {
    font-family: var(--mono);
    font-size: 0.84em;
    color: var(--accent);
  }

  .codeblock {
    margin: 20px 0 26px;
    padding: 18px 18px;
    overflow-x: auto;
    border: 1px solid var(--border);
    background: var(--bg-subtle);
    color: var(--text);
    font-size: 0.73rem;
    line-height: 1.55;
  }

  .codeblock code {
    font-family: var(--mono);
    white-space: pre;
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
    line-height: 1.72;
    color: var(--text-bright);
  }

  .bullet-prose li::before {
    content: '->';
    position: absolute;
    left: 0;
    color: var(--accent);
    font-family: var(--mono);
    font-size: 0.72rem;
  }

  .todo-list {
    border-left: 2px solid var(--accent-dim);
    padding-left: 20px;
  }

  .todo-list p {
    margin-bottom: 10px;
    color: var(--text);
  }

  .wt-footer {
    margin-top: 68px;
    padding-top: 24px;
    border-top: 1px solid var(--border);
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    font-size: 0.78rem;
    color: var(--text-dim);
  }

  .wt-footer a {
    color: var(--accent);
    text-decoration: none;
  }

  @media (max-width: 620px) {
    .walkthrough {
      padding: 32px 20px 80px;
    }

    .wt-header h1 {
      font-size: 2rem;
    }

    .part h2 {
      font-size: 1.35rem;
    }

    .codeblock {
      font-size: 0.68rem;
      padding: 14px;
    }
  }
</style>

<script>
  const dragoniteCandidates = Object.entries(
    import.meta.glob('../*.{png,jpg,jpeg,webp,avif,svg}', {
      eager: true,
      import: 'default'
    })
  )
    .filter(([path]) => path.toLowerCase().includes('dragonite'))
    .sort(([a], [b]) => a.localeCompare(b));

  const dragoniteImage = dragoniteCandidates[0]?.[1] ?? null;

  const navItems = [
    { href: '#work', label: 'work' },
    { href: '#open', label: 'open' },
    { href: '#writing', label: 'writing' },
    { href: '#contact', label: 'contact' }
  ];

  const currentItems = [
    {
      tag: 'contractor',
      text: 'Building synthetic drone data generation pipelines in Unreal Engine. Headless georeferenced world rendering with PCG-based landscapes and CineCamera observers, outputting training sets with bounding box metadata. C++ render layer, Rust orchestration, Python ML inference.'
    },
    {
      tag: 'school',
      text: 'CS-2050 at Harvard. High-performance computing - MPI, CUDA, OpenMP. Competing on a Slurm cluster leaderboard. Currently working on parallel neighbor list construction for molecular dynamics simulations.'
    },
    {
      tag: 'nights & weekends',
      text: 'Genesis - a transactional mutation kernel where programs are content-addressed symbolic graphs, mutations are structural deltas, and side effects are capability-gated. SBCL as the semantic kernel, C broker for agent lifecycle management, ephemeral Rust processes per task. Designed as a foundation for AI-native software construction.'
    }
  ];

  const clientWork = [
    {
      name: 'MedQuest',
      context: 'medical practice platform',
      description:
        'Three production applications for a medical practice - AI conversational booking, treatment & supplement tracker, patient-facing sites. Currently architecting a migration off PatientNow by leveraging incoming CMS-0057-F FHIR API mandates (Jan 2027 deadline) to own the full revenue cycle. Four-phase rollout across scheduling, billing, records, and patient engagement.'
    },
    {
      name: 'Cloud infrastructure',
      context: 'Cymantix · SOC2',
      description:
        'Terraform-based production infrastructure. Designed the IAM policy structure, logging pipeline, and environment isolation to get them through SOC2 compliance.'
    },
    {
      name: 'Domain-specific retrieval system',
      context: 'Cymantix',
      description:
        'Retrieval-augmented reasoning system tuned to their product domain. Custom chunking, retrieval pipeline, and reranking - not a LangChain wrapper.'
    },
    {
      name: 'LLM domain adaptation',
      context: 'NSA-funded research',
      description:
        'Self-denoising autoencoder approach to adapting language models to specialized domains without catastrophic forgetting.'
    }
  ];

  const openWork = [
    {
      name: 'Genesis',
      context: 'in progress',
      description:
        "Event-sourced development substrate. Five-field content-addressed nodes (kind, name, refs, body, hash), five primitive verbs (create, destroy, change, revert, inspect), capability model derived from seL4 and Mark Miller's E-language. The refs field is separated for transparent DAG traversal. Theoretical lineage: lambda calculus, Scott domains, Adapton's demanded computation graphs, SICP metacircular evaluator."
    },
    {
      name: 'Byron',
      context: 'LSM-tree key-value store',
      description:
        'Implements the Monkey and Dostoevsky optimization papers for tuning bloom filter memory allocation and compaction across LSM-tree levels. Built under Stratos at Harvard.',
      link: {
        href: 'https://github.com/arvaer/byron',
        label: 'github.com/arvaer/byron ->'
      }
    },
    {
      name: 'FPGA soft-core CPU',
      description:
        'Processor, assembler, and compiler frontend from the gate level up. Wanted the full mental model from silicon to language before building anything on top of it.'
    }
  ];

  const writing = [
    { title: 'Why C for the broker: earning your abstractions' },
    { title: 'SBCL as a semantic kernel - choosing a Lisp in 2026' },
    { title: 'Content-addressed nodes and the five primitive verbs' },
    { title: 'Flanking a walled garden with FHIR mandates' },
    { title: 'Parallel neighbor lists in molecular dynamics - per-rank local rebuild vs global allreduce' },
    { title: 'Tiled GEMM on sm_120: what the memory hierarchy is actually doing' }
  ];
</script>

<svelte:head>
  <title>Prominent Systems</title>
  <meta
    name="description"
    content="Prominent Systems - software, infrastructure, and research work by Mikey."
  />
</svelte:head>

<div class="container">
  <header>
    <div class="hero-shell">
      <div class="hero-copy">
        <div class="header-name">Mikey</div>
        <div class="header-sub">Prominent Systems</div>
      </div>

      {#if dragoniteImage}
        <figure class="hero-dragonite" aria-label="Dragonite accent image">
          <div class="hero-dragonite-frame">
            <img src={dragoniteImage} alt="Dragonite" />
          </div>
        </figure>
      {/if}
    </div>
  </header>

  <nav aria-label="Primary">
    {#each navItems as item}
      <a href={item.href}>{item.label}</a>
    {/each}
  </nav>

  <section>
    <div class="section-label">Currently</div>

    {#each currentItems as item}
      <div class="current-block">
        <div class="tag">{item.tag}</div>
        <p>{item.text}</p>
      </div>
    {/each}
  </section>

  <section id="work">
    <div class="section-label">Client work</div>

    {#each clientWork as project}
      <div class="project">
        <div class="project-header">
          <span class="project-name">{project.name}</span>
          {#if project.context}
            <span class="project-context">{project.context}</span>
          {/if}
        </div>
        <div class="project-desc">{project.description}</div>
      </div>
    {/each}
  </section>

  <section id="open">
    <div class="section-label">Open work</div>

    {#each openWork as project}
      <div class="project">
        <div class="project-header">
          <span class="project-name">{project.name}</span>
          {#if project.context}
            <span class="project-context">{project.context}</span>
          {/if}
        </div>
        <div class="project-desc">{project.description}</div>
        {#if project.link}
          <a class="project-link" href={project.link.href}>{project.link.label}</a>
        {/if}
      </div>
    {/each}
  </section>

  <section id="writing">
    <div class="section-label">Writing</div>

    <ul class="blog-list">
      {#each writing as entry}
        <li class="blog-item">
          <span class="blog-title">{entry.title}</span>
          <span class="blog-date">draft</span>
        </li>
      {/each}
    </ul>
  </section>

  <section id="contact">
    <div class="section-label">Contact</div>

    <div class="contact-line"><a href="mailto:mikey@arvaer.com">mikey@arvaer.com</a></div>
    <div class="contact-line"><a href="https://github.com/arvaer">github.com/arvaer</a></div>

    <div class="contact-note">
      I take one client at a time. Fixed price, clear timeline. If the project goes well,
      optional retainer so you're never left hanging.
    </div>
  </section>

  <footer>Prominent Systems · 2026</footer>
</div>

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
      tag: 'contractor at IPS (Intel Payload Systems)',
      text: 'Synthetic drone data generation in Unreal Engine. Making Diffusion-based forward modeling across ControlNet, Stable Diffusion, and FramePack very fast and realistic!'
    },
    {
      tag: 'research',
      text: 'FPGA+GPU acceleration for LLM inference - heterogeneous compute for latency-critical workloads. Portable neighbor list kernels for molecular dynamics. '
    }
  ];

  const clientWork = [
    {
      name: 'gopigeon.dev',
      context: 'solo dev',
      description:
      'A microSaaS to enable LLMs with durable queues and fan-out form filling. Common Lisp backend, Svelte Front end, self managed kubernetes cluster on my own physical hardware.'
    },
    {
      name: 'Healthtech platform',
      context: 'contractor · staff eng',
      description:
        'HIPAA-compliant AWS migration, churn prediction model (92% ROC-AUC), AI clinical interface serving 30k+ caregivers.'
    },
    {
      name: 'MedQuest',
      context: 'medical practice platform',
      description:
        'Three production applications for a medical practice - AI conversational booking, treatment & supplement tracker, patient-facing sites. Currently architecting a migration off PatientNow, aligned with the CMS-0057-F FHIR API mandate (Jan 2027 deadline). Four-phase rollout across scheduling, billing, records, and patient engagement.'
    },
    {
      name: 'Cymantix',
      context: 'cloud infrastructure & domain-specific retrieval',
      description:
        'Terraform-based production infrastructure - IAM policy structure, logging pipeline, and environment isolation that got them through SOC 2. Also built their retrieval-augmented reasoning system - custom chunking, retrieval pipeline, and reranking tuned to their product domain.'
    },
    {
      name: 'LLM domain adaptation',
      context: 'NSA-funded research',
      description:
        'Self-denoising autoencoder approach to adapting language models to specialized domains without catastrophic forgetting.'
    },
    {
      name: 'FPGA soft-core CPU',
      description:
        'Soft-core CPU on FPGA from scratch with a custom ISA. Full assembler and compiler toolchain. Eventually got DOOM running on it.'
    },
    {
      name: 'Coreboot ThinkPad firmware',
      description:
        'Opened the machines, wrote custom RP2040 firmware for the SPI reader, reverse-engineered portions of the proprietary blob with public docs, got a clean Coreboot payload running.'
    },
  ];

  const openWork = [
    {
      name: 'Genesis',
      context: 'in progress',
      description:
        'Event-sourced development substrate. Five-field content-addressed nodes (kind, name, refs, body, hash), five primitive verbs (create, destroy, change, revert, inspect). Mourning the death of lisp 30 years late.'
    },
    {
      name: 'Byron',
      context: 'LSM-tree key-value store',
      description:
        'Implements the Monkey and Dostoevsky optimization papers for tuning bloom filter memory allocation and compaction across LSM-tree levels. Built at Harvard.',
      link: {
        href: 'https://github.com/arvaer/byron',
        label: 'github.com/arvaer/byron ->'
      }
    },
  ];

  const formEndpoint = 'https://api.gopigeon.dev/f/f_mm0k4yisfzkqvz5z';

  let formName = '';
  let formEmail = '';
  let formMessage = '';
  let formCompany = '';
  let formStatus = 'idle';

  function resetForm() {
    formName = '';
    formEmail = '';
    formMessage = '';
    formCompany = '';
    formStatus = 'idle';
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (formStatus === 'sending') return;

    if (formCompany) {
      formStatus = 'sent';
      formName = '';
      formEmail = '';
      formMessage = '';
      formCompany = '';
      return;
    }

    formStatus = 'sending';

    try {
      const res = await fetch(formEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          name: formName,
          email: formEmail,
          message: formMessage
        })
      });

      if (!res.ok) {
        throw new Error(`request failed: ${res.status}`);
      }

      formStatus = 'sent';
      formName = '';
      formEmail = '';
      formMessage = '';
    } catch (err) {
      formStatus = 'error';
    }
  }

  const writing = [
    {
      title: 'ghostly-runs — neighbor-list construction across five parallelization regimes',
      status: 'walkthrough',
      href: '/writing/ghostly/'
    },
    {
      title: 'RV32IM, from gates up — soft-core CPU, assembler, and emulator',
      status: 'walkthrough',
      href: '/writing/softcore/'
    },
    {
      title: 'Byron — an LSM-tree key-value store',
      status: 'walkthrough',
      href: '/writing/byron/'
    },
    {
      title: 'Heterogeneous computing in Log-Structured Merge Trees',
      status: 'pdf',
      href: '/papers/lsm.pdf'
    },
    {
      title: 'Genesis — content-addressed mutation kernel',
      status: 'scheduled',
      href: null
    }
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
          {#if entry.href}
            <a class="blog-title" href={entry.href}>{entry.title}</a>
          {:else}
            <span class="blog-title">{entry.title}</span>
          {/if}
          <span class="blog-date">{entry.status}</span>
        </li>
      {/each}
    </ul>
  </section>

  <section id="contact">
    <div class="section-label">Contact</div>

    <div class="contact-line"><a href="mailto:mikey@arvaer.com">mikey@arvaer.com</a></div>
    <div class="contact-line"><a href="https://github.com/arvaer">github.com/arvaer</a></div>

    <div class="contact-note">
      Please reach out if you're interested in hiring me. I don't take many clients, and always have an optional retainment fee if the project goes well. 
    </div>

    {#if formStatus === 'sent'}
      <div class="contact-form contact-form-sent" role="status">
        <div class="form-msg form-msg-ok">sent. I'll reply from mikey@arvaer.com.</div>
        <button type="button" class="form-reset" on:click={resetForm}>send another →</button>
      </div>
    {:else}
      <form class="contact-form" on:submit={handleSubmit} novalidate>
        <div class="form-row">
          <label for="cf-name">name</label>
          <input
            id="cf-name"
            name="name"
            type="text"
            autocomplete="name"
            bind:value={formName}
            required
          />
        </div>

        <div class="form-row">
          <label for="cf-email">email</label>
          <input
            id="cf-email"
            name="email"
            type="email"
            autocomplete="email"
            bind:value={formEmail}
            required
          />
        </div>

        <div class="form-row">
          <label for="cf-message">message</label>
          <textarea
            id="cf-message"
            name="message"
            rows="5"
            bind:value={formMessage}
            required
          ></textarea>
        </div>

        <div class="form-hp" aria-hidden="true">
          <label for="cf-company">company</label>
          <input
            id="cf-company"
            name="company"
            type="text"
            tabindex="-1"
            autocomplete="off"
            bind:value={formCompany}
          />
        </div>

        <div class="form-actions">
          <button type="submit" disabled={formStatus === 'sending'}>
            {#if formStatus === 'sending'}sending…{:else}send →{/if}
          </button>
          {#if formStatus === 'error'}
            <span class="form-msg form-msg-err">couldn't send — try again or email mikey@arvaer.com directly.</span>
          {/if}
        </div>
      </form>
    {/if}
  </section>

  <footer>Prominent Systems · 2026</footer>
</div>

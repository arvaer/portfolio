<script>
  const bobbieCandidates = Object.entries(
    import.meta.glob('../*.{png,jpg,jpeg,webp,avif,svg}', {
      eager: true,
      import: 'default'
    })
  )
    .filter(([path]) => path.toLowerCase().includes('bobbie'))
    .sort(([a], [b]) => a.localeCompare(b));

  const bobbieImage = bobbieCandidates[0]?.[1] ?? null;

  const navItems = [
    { href: '#work', label: 'work' },
    { href: '#open', label: 'open' },
    { href: '#writing', label: 'writing' },
    { href: '#contact', label: 'contact' }
  ];

  const currentItems = [
    {
      tag: 'contractor',
      text: 'World modeling through synthetic data generation; ingesting and federating search over 60GB+ of live data on satellites, aircraft, ships, terrain, cars, foliage, weather... into versioned small worlds. Gang scheduling is my new favorite word! Designed a Lisp that compiles into an operation graph so each kernel can be optimized.'
    },
    {
      tag: 'research',
      text: 'FPGA+GPU acceleration for LLM inference. Porting code from CUDA to ROCm and optimizing HIP. Bounded, demand-driven computation and lots of Marvin Minsky.'
    },
    {
      tag: 'gopigeon.dev',
      text:
      'A foray into what it\'s like to run Common Lisp in prod. Built with an event-driven architecture on top of Postgres and deployed across GKE as well as a few local edge nodes; uses OpenFaaS, Kueue, and lots and lots of Nix.'
    },
  ];

  const clientWork = [
    {
      name: 'Healthtech platform',
      context: 'contractor · staff eng',
      description:
      'Completed a full HIPAA-compliant AWS migration. Built, backtested, and deployed a churn prediction model (92% ROC-AUC) to 30k+ users.'
    },
    {
      name: 'Cymantix',
      context: 'cloud infrastructure & domain-specific retrieval',
      description:
        'Federated distributed search over web-scale unstructured data. LLM/Transformer-based domain adaptation in collaboration with NC State and UNC before it was cool.'
    },
    {
      name: 'LLM domain adaptation',
      context: 'NSA-funded research',
      description:
        'Self-denoising autoencoder approach to adapting language models to specialized domains without catastrophic forgetting. Beat the PandaJAM challenge!'
    },
    {
      name: 'FPGA soft-core CPU',
      description:
        'Built a soft-core CPU on FPGA in Verilog with a custom ISA. Full assembler and compiler toolchain. Eventually got DOOM running on it.'
    },
    {
      name: 'Coreboot ThinkPad firmware',
      description:
        'Wrote custom RP2040 firmware for the SPI reader, reverse-engineered portions of the proprietary blob with public docs, got a clean Coreboot payload running before Claude made it trivial.'
    },
  ];

  const openWork = [
    {
      name: 'Genesis',
      context: 'in progress',
      description:
        'my secret moonshot'
    },
    {
      name: 'byron',
      context: 'LSM-tree key-value store',
      description:
        'Implements the Monkey and Dostoevsky optimization papers for tuning bloom filter memory allocation and compaction across LSM-tree levels',
      link: {
        href: 'https://github.com/arvaer/byron',
        label: 'github.com/arvaer/byron ->'
      }
    },
  ];

  const formEndpoint = 'https://api.gopigeon.dev/f/f_6hctsfc40xmk35sp';

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
  <title>Mikey Almeida · arvaer</title>
  <meta
    name="description"
    content="Software, infrastructure, and research work by Mikey Almeida (arvaer)."
  />
</svelte:head>

<div class="container">
  <header>
    <div class="hero-shell">
      <div class="hero-copy">
        <div class="header-name">Mikey Almeida</div>
        <div class="header-sub">@arvaer</div>
      </div>

      {#if bobbieImage}
        <figure class="hero-bobbie" aria-label="Bobbie the cat">
          <div class="hero-bobbie-frame">
            <img src={bobbieImage} alt="Bobbie, my cat" />
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
    <div class="section-label">currently</div>

    {#each currentItems as item}
      <div class="current-block">
        <div class="tag">{item.tag}</div>
        <p>{item.text}</p>
      </div>
    {/each}
  </section>

  <section id="work">
    <div class="section-label">previously</div>

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
      Please feel free to send me an email if you would like to connect over some topic! 
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

  <footer>Mikey Almeida · @arvaer · 2026</footer>
</div>

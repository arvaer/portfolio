<script>
  import Home from './Home.svelte';
  import ByronWalkthrough from './writing/ByronWalkthrough.svelte';
  import GhostlyRunsWalkthrough from './writing/GhostlyRunsWalkthrough.svelte';
  import JcoScenarioWalkthrough from './writing/JcoScenarioWalkthrough.svelte';
  import SoftCoreWalkthrough from './writing/SoftCoreWalkthrough.svelte';

  function currentRoute() {
    if (typeof window === 'undefined') return '/';
    const path = window.location.pathname.replace(/\/+$/, '') || '/';
    if (path.startsWith('/writing/byron')) return '/writing/byron';
    if (path.startsWith('/writing/ghostly')) return '/writing/ghostly';
    if (path.startsWith('/writing/jco-scenario-dsl')) return '/writing/jco-scenario-dsl';
    if (path.startsWith('/writing/softcore')) return '/writing/softcore';
    return '/';
  }

  let route = $state(currentRoute());

  $effect(() => {
    const onNav = () => {
      const next = currentRoute();
      if (route !== next) {
        window.scrollTo(0, 0);
        route = next;
      }
    };
    const onClick = (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest('a');
      if (!a) return;
      const href = a.getAttribute('href');
      if (!href || href.startsWith('#') || a.target === '_blank' || a.hasAttribute('download')) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname.endsWith('.pdf')) return;
      e.preventDefault();
      if (url.pathname !== window.location.pathname) {
        window.history.pushState({}, '', url.pathname + url.hash);
        onNav();
      } else if (url.hash) {
        window.location.hash = url.hash;
      }
    };
    window.addEventListener('popstate', onNav);
    document.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('popstate', onNav);
      document.removeEventListener('click', onClick);
    };
  });
</script>

{#if route === '/writing/byron'}
  <ByronWalkthrough />
{:else if route === '/writing/ghostly'}
  <GhostlyRunsWalkthrough />
{:else if route === '/writing/jco-scenario-dsl'}
  <JcoScenarioWalkthrough />
{:else if route === '/writing/softcore'}
  <SoftCoreWalkthrough />
{:else}
  <Home />
{/if}

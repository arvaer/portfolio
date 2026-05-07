<script>
  import Home from './Home.svelte';
  import ByronWalkthrough from './writing/ByronWalkthrough.svelte';
  import GhostlyRunsWalkthrough from './writing/GhostlyRunsWalkthrough.svelte';

  function currentRoute() {
    const hash = window.location.hash.replace(/^#/, '');
    return hash.startsWith('/writing/') ? hash : '/';
  }

  let route = $state(currentRoute());

  $effect(() => {
    const onHashChange = () => {
      const next = currentRoute();
      if ((route === '/') !== (next === '/')) {
        window.scrollTo(0, 0);
      }
      route = next;
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  });
</script>

{#if route.startsWith('/writing/byron')}
  <ByronWalkthrough />
{:else if route.startsWith('/writing/ghostly')}
  <GhostlyRunsWalkthrough />
{:else}
  <Home />
{/if}

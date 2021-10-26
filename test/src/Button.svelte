<script>
  export let toggled = false;
</script>

<button type="button" on:click on:click={() => (toggled = !toggled)}><slot /></button>

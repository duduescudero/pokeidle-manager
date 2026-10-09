export function createMerger() {
  let state = null, pokemons = new Map();
  return partial => {
    if (!partial) return state;
    const { cheio, pokemons: list, pkMud, pkFora, dexMud, dexFora, ...rest } = partial;
    if (cheio || !state) { state = { ...rest }; pokemons = new Map((list ?? []).map(p => [p.id,p])); }
    else {
      Object.assign(state,rest);
      if (list) pokemons = new Map(list.map(p => [p.id,p]));
      for (const p of pkMud ?? []) pokemons.set(p.id,p);
      for (const id of pkFora ?? []) pokemons.delete(id);
      if (dexMud || dexFora) { state.pokedex = { ...state.pokedex, ...dexMud }; for (const k of dexFora ?? []) delete state.pokedex[k]; }
    }
    return { ...state, pokemons: [...pokemons.values()] };
  };
}

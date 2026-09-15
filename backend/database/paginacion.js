function resolverPaginacion({ limit, offset, defaultLimit = 100, maxLimit = 1000 } = {}) {
  const todos = limit === 'TODOS' || limit === 'todos';
  let lim = todos ? maxLimit : Number(limit);
  let off = Number(offset);

  if (!Number.isFinite(lim) || lim < 1) lim = defaultLimit;
  lim = Math.min(Math.floor(lim), maxLimit);

  if (!Number.isFinite(off) || off < 0) off = 0;
  off = Math.floor(off);

  return { limit: lim, offset: off };
}

module.exports = { resolverPaginacion };

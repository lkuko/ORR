// Optimistic transactions with conflict retries. Local simulation, not a cloud test.
function createMemoryStore() {
  let docs = new Map(), revision = 0
  function bind(map, transactional = false) {
    return {
      async get(collection, id) { return structuredClone(map.get(collection + '/' + id) || null) },
      async put(collection, id, data) {
        map.set(collection + '/' + id, structuredClone({ ...data, id }))
        if (!transactional) revision++
      },
      async list(collection, filter = {}, order = 'createdAt', direction = 'desc', limit = 100) {
        if (transactional) throw new Error('Queries are forbidden inside CloudBase transactions')
        return [...docs.entries()].filter(([key]) => key.startsWith(collection + '/')).map(([, value]) => structuredClone(value))
          .filter(doc => Object.entries(filter).every(([k, v]) => v && typeof v === 'object' && '$in' in v ? v.$in.includes(doc[k]) : doc[k] === v))
          .sort((a, b) => (String(a[order]).localeCompare(String(b[order]))) * (direction === 'desc' ? -1 : 1)).slice(0, limit)
      },
      async transact(work) {
        for (let attempt = 0; attempt < 40; attempt++) {
          const version = revision, snapshot = structuredClone(docs)
          const result = await work(bind(snapshot, true))
          if (version !== revision) continue
          docs.clear()
          for (const [key, value] of snapshot) docs.set(key, value)
          revision++
          return result
        }
        throw new Error('Write conflict')
      }
    }
  }
  return bind(docs)
}
module.exports = { createMemoryStore }

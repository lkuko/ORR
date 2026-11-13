// wx-server-sdk shape adapter. Transactions deliberately use start/commit:
// SDK runTransaction versions differ in callback return values and retry policy.
const { AppError } = require('./errors')
function isConflict(error) {
  return /DATABASE_TRANSACTION_CONFLICT|ResourceUnavailable\.TransactionConflict|write conflict|transaction (?:is )?conflict/i
    .test([error.code, error.errMsg, error.message].filter(Boolean).join(' '))
}
function normalize(data) {
  const doc = Array.isArray(data) ? data[0] : data
  return doc && doc._id ? { ...doc, id: doc._id } : null
}
function createStore(db, root = db) {
  return {
    async get(collection, id) {
      // Missing documents return null with throwOnNotFound:false. Missing
      // collections/permission errors must propagate, never masquerade as null.
      return normalize((await db.collection(collection).doc(id).get()).data)
    },
    async put(collection, id, value) {
      const { id: ignoredId, _id, ...data } = value
      await db.collection(collection).doc(id).set({ data })
    },
    async list(collection, filter = {}, order = 'createdAt', direction = 'desc', limit = 100) {
      const conditions = {}
      for (const [key, value] of Object.entries(filter)) {
        if (value && typeof value === 'object') {
          const operators = { $in: 'in', $lt: 'lt', $lte: 'lte', $gt: 'gt', $gte: 'gte', $ne: 'neq' }
          if ('$regex' in value) conditions[key] = root.RegExp({ regexp: value.$regex, options: 'i' })
          else {
            const parts = Object.entries(value).map(([op, operand]) => {
              if (!operators[op]) throw new Error('Unsupported query operator')
              return root.command[operators[op]](operand)
            })
            conditions[key] = parts.reduce((left, right) => left.and(right))
          }
        } else conditions[key] = value
      }
      const response = await db.collection(collection).where(conditions).orderBy(order, direction).limit(limit).get()
      return response.data.map(normalize)
    },
    async transact(work) {
      for (let attempt = 0; attempt < 7; attempt++) {
        let transaction
        try {
          transaction = await root.startTransaction()
          const result = await work(createStore(transaction, root))
          await transaction.commit()
          return result
        } catch (error) {
          if (transaction) try { await transaction.rollback() } catch (_) {}
          if (error instanceof AppError) throw error
          if (!isConflict(error)) throw error
          if (attempt === 6) throw new AppError('BUSY', '操作繁忙，请稍后重试')
          await new Promise(resolve => setTimeout(resolve, Math.min(40 * (2 ** attempt), 500) + Math.floor(Math.random() * 50)))
        }
      }
    }
  }
}
module.exports = { createStore, isConflict }

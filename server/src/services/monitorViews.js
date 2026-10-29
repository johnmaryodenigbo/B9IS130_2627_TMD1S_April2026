// Shapes of a monitor sent to clients. Accepts a Mongoose document or a plain object.

const toPlain = (m) => (typeof m?.toObject === 'function' ? m.toObject() : { ...m });

// Everything except internals — for logged-in admins/SREs.
export function toStaffView(m) {
  const { _id, __v, ...rest } = toPlain(m);
  return { ...rest, id: String(_id ?? rest.id) };
}

// Safe for anonymous visitors: no URL, method, errors or settings.
export function toPublicView(m) {
  const o = toPlain(m);
  return {
    id: String(o._id ?? o.id),
    name: o.name,
    description: o.description,
    environment: o.environment,
    status: o.status,
    statusChangedAt: o.statusChangedAt ?? null,
    lastCheckedAt: o.lastCheckedAt ?? null,
    lastResponseTimeMs: o.lastResponseTimeMs ?? null,
  };
}

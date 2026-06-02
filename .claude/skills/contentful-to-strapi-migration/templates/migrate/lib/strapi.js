/**
 * Tiny Strapi v5 REST client for the migration.
 *
 * Notes specific to Strapi v5:
 *  - Entries are addressed by `documentId` (a stable string), not the numeric id.
 *  - Responses are flattened: fields live directly on the object, not under
 *    `data.attributes` like in v4.
 *  - Files cannot be uploaded while creating an entry. Upload first (POST
 *    /api/upload), then set the returned numeric file id on the media field
 *    directly (media is set by id; the relation `connect` form is ignored for media).
 */

export class StrapiClient {
  constructor({ baseUrl, token }) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.token = token;
  }

  async #request(path, { method = 'GET', body, headers = {} } = {}) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...headers,
      },
      body,
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : {};
    if (!res.ok) {
      const message = json?.error?.message || res.statusText;
      throw new Error(`${method} ${path} -> ${res.status} ${message}`);
    }
    return json;
  }

  #json(path, method, data) {
    return this.#request(path, {
      method,
      body: JSON.stringify({ data }),
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /** Create an entry in a collection type. Returns the created record (flattened). */
  async create(pluralApiId, data) {
    const res = await this.#json(`/api/${pluralApiId}`, 'POST', data);
    return res.data;
  }

  /** Update an entry (collection type) by documentId. */
  async update(pluralApiId, documentId, data) {
    const res = await this.#json(`/api/${pluralApiId}/${documentId}`, 'PUT', data);
    return res.data;
  }

  /** Create or update a single type (no documentId in the URL). */
  async putSingle(pluralApiId, data) {
    const res = await this.#json(`/api/${pluralApiId}`, 'PUT', data);
    return res.data;
  }

  /**
   * Find the first entry whose `contentfulId` matches. Used to make the
   * migration idempotent: re-running updates the same record instead of
   * creating a duplicate.
   */
  async findByContentfulId(pluralApiId, contentfulId) {
    const qs = new URLSearchParams();
    qs.set('filters[contentfulId][$eq]', contentfulId);
    qs.set('pagination[pageSize]', '1');
    qs.set('publicationState', 'preview'); // include drafts
    const res = await this.#request(`/api/${pluralApiId}?${qs.toString()}`);
    return res.data?.[0] ?? null;
  }

  /** Read a single type (returns null if it has no entry yet). */
  async getSingle(pluralApiId) {
    try {
      const res = await this.#request(`/api/${pluralApiId}`);
      return res.data ?? null;
    } catch (err) {
      if (String(err.message).includes('404')) return null;
      throw err;
    }
  }

  /**
   * Upload a file. `file` is a Blob/File (Node 18+ globals). Returns the
   * uploaded media record including its numeric `id`, which is what relation
   * fields connect to for media.
   */
  async upload(file, fileName, fileInfo = {}) {
    const form = new FormData();
    form.append('files', file, fileName);
    form.append('fileInfo', JSON.stringify(fileInfo));
    const res = await this.#request('/api/upload', { method: 'POST', body: form });
    return Array.isArray(res) ? res[0] : res;
  }

  /** Look up an already-uploaded file by name (idempotent asset migration). */
  async findUploadByName(name) {
    const qs = new URLSearchParams();
    qs.set('filters[name][$eq]', name);
    qs.set('pagination[pageSize]', '1');
    const res = await this.#request(`/api/upload/files?${qs.toString()}`);
    return Array.isArray(res) && res.length ? res[0] : null;
  }
}

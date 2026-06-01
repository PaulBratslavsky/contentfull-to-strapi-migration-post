'use strict';

/**
 * Content types that should be readable by the public role without auth.
 * Collection types expose find + findOne; the single type exposes find only.
 */
const PUBLIC_PERMISSIONS = {
  'blog-post': ['find', 'findOne'],
  author: ['find', 'findOne'],
  category: ['find', 'findOne'],
  'landing-page': ['find'],
};

async function grantPublicReadPermissions(strapi) {
  const publicRole = await strapi
    .query('plugin::users-permissions.role')
    .findOne({ where: { type: 'public' } });

  if (!publicRole) return;

  for (const [contentType, actions] of Object.entries(PUBLIC_PERMISSIONS)) {
    for (const action of actions) {
      const permissionAction = `api::${contentType}.${contentType}.${action}`;
      const existing = await strapi
        .query('plugin::users-permissions.permission')
        .findOne({ where: { action: permissionAction, role: publicRole.id } });

      if (!existing) {
        await strapi.query('plugin::users-permissions.permission').create({
          data: { action: permissionAction, role: publicRole.id },
        });
      }
    }
  }
}

module.exports = {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   */
  register(/*{ strapi }*/) {},

  /**
   * Runs on every boot. Idempotently grants the public role read access to the
   * migrated content types so the REST API can be verified without logging in.
   */
  async bootstrap({ strapi }) {
    await grantPublicReadPermissions(strapi);
  },
};

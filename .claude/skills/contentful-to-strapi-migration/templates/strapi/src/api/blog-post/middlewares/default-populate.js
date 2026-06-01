'use strict';

/**
 * `default-populate` middleware
 *
 * Auto-populates relations and media on blog-post find/findOne so callers don't
 * have to pass ?populate. Skipped when the request already specifies populate.
 */

module.exports = (config, { strapi }) => {
  return async (ctx, next) => {
    if (!ctx.query.populate) {
      ctx.query.populate = {
        coverImage: { fields: ['name', 'alternativeText', 'url', 'width', 'height'] },
        author: { fields: ['name', 'bio'], populate: { avatar: { fields: ['url'] } } },
        category: { fields: ['title', 'slug'] },
      };
    }
    await next();
  };
};

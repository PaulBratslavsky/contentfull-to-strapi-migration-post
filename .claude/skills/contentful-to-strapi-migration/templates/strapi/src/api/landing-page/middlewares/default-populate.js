'use strict';

/**
 * `default-populate` middleware for the landing page single type.
 */

module.exports = (config, { strapi }) => {
  return async (ctx, next) => {
    if (!ctx.query.populate) {
      ctx.query.populate = {
        heroImage: { fields: ['name', 'alternativeText', 'url', 'width', 'height'] },
        featuredPosts: {
          fields: ['title', 'slug', 'excerpt'],
          populate: { coverImage: { fields: ['url'] } },
        },
      };
    }
    await next();
  };
};
